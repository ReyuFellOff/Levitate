// xoxo/levitate.ts — per-cluster bootstrap
//
// Boot order:
//   1.  Login + await clientReady
//   2.  [HOST] hosting service detection
//   3.  [DATABASE] init + connect
//   4.  [DATABASE - LOADING DATA] AFK cache, noprefix state, guild prefixes
//   5.  Loader blocks: events, helpers, prefix commands, slash commands
//   6.  [SLASH] global registration
//   7.  Apply default presence
//   8.  Side-effects: enforce blacklisted servers, send pending restart notice
//   9.  [YAY!] ready

import 'dotenv/config';
import { LevitateClient }         from './structures/LevitateClient.js';
import { loadAllEvents }         from './handlers/eventLoader.js';
import { loadHelpers }           from './handlers/helperLoader.js';
import { loadPrefixCommands }    from './handlers/commandLoader.js';
import { loadSlashCommands }     from './handlers/slashLoader.js';
import { registerSlashCommands } from './handlers/commandRegister.js';
import webhookLogger             from './utils/webhookLogger.js';
import { getHostingServiceIP }   from './helpers/getHostingServiceIP.js';
import { initDatabase }          from './database/database.js';
import { blacklistedServer }     from './components/statusMessages.js';
import {
  ContainerBuilder,
  MessageFlags,
  TextDisplayBuilder,
} from 'discord.js';
import { emojis }  from './emojis.js';
import config, { botName } from './config.js';
import { StatusManager } from './structures/StatusManager.js';
import { reapplyAllNameStyles } from './helpers/nameStyle.js';

async function bootstrap(): Promise<void> {
  // During rapid reconnect storms discord.js/ws adds temporary listeners to
  // WebSocketShard for each attempt. Raise the limit so Node doesn't print
  // spurious "possible memory leak" warnings — this is not an actual leak.
  process.setMaxListeners(25);

  const client = new LevitateClient();

  // Attach the ready listener BEFORE login so we never miss the event.
  const readyPromise = new Promise<void>((resolve) => {
    client.once('clientReady' as any, () => resolve());
  });

  // ── Shard-level diagnostics ─────────────────────────────────────────────
  // Discord's gateway occasionally rejects the WebSocket handshake (e.g.
  // "Unexpected server response: 503") during edge-network hiccups on the
  // host's side. discord.js retries these automatically, but we log them
  // with timestamps so incidents like an overnight reconnect loop can be
  // traced back to a specific window instead of guessing.
  client.on('shardDisconnect' as any, (event: any, shardId: number) => {
    console.warn(`[SHARD ${shardId}] Disconnected (code ${event?.code ?? '?'}) at ${new Date().toISOString()}`);
  });
  client.on('shardReconnecting' as any, (shardId: number) => {
    console.warn(`[SHARD ${shardId}] Reconnecting at ${new Date().toISOString()}`);
  });
  client.on('shardResume' as any, (shardId: number, replayed: number) => {
    console.log(`[SHARD ${shardId}] Resumed (replayed ${replayed} events) at ${new Date().toISOString()}`);
  });
  client.on('shardError' as any, (error: Error, shardId: number) => {
    console.error(`[SHARD ${shardId}] Error at ${new Date().toISOString()}: ${error.message}`);
  });

  await client.login(config.botToken);
  await readyPromise;

  console.log(`[CLIENT] Logged in as ${client.user?.tag}`);
  console.log(`[CLIENT] Cluster ID: ${client.cluster.id}`);

  // ── [HOST] ──────────────────────────────────────────────────────────────────
  await getHostingServiceIP();

  // ── [DATABASE] init ──────────────────────────────────────────────────────────
  const buildName = botName;
  try {
    const database = await initDatabase(buildName);
    client.db = database;
  } catch (err) {
    console.error(`[DATABASE] Failed to initialise: ${(err as Error).message}`);
    // Non-fatal — bot runs without DB (noprefix/blacklist silently skipped).
  }

  // ── [DATABASE - LOADING DATA] ────────────────────────────────────────────────
  if (client.db) {
    await loadCachedDataBlock(client);
  }

  // ── Loaders ──────────────────────────────────────────────────────────────────
  await loadAllEvents(client);
  client.helpers = await loadHelpers(client);
  await loadPrefixCommands(client);
  await loadSlashCommands(client);
  await registerSlashCommands(client);

  // ── Presence (StatusManager) ─────────────────────────────────────────────────
  const statusManager = new StatusManager(client, process.env['DISCORD_CLIENT_ID']);
  client.statusManager = statusManager;
  if (statusManager.hasMatchedInstance()) {
    statusManager.start();
  } else {
    // No matching BotInstance — fall back to the defaultPresence in config.
    if (client.user && client.config.defaultPresence) {
      client.user.setPresence({
        activities: [{
          name: client.config.defaultPresence.name,
          type: client.config.defaultPresence.type as any,
        }],
        status: client.config.defaultPresence.status as any,
      });
    }
  }

  // ── Side-effects (fire-and-forget) ───────────────────────────────────────────
  enforceBlacklistedServers(client).catch((): null => null);
  sendPendingRestartNotification(client).catch((): null => null);
  reapplyAllNameStyles(client).catch((): null => null);

  // ── Persist initial stats to MongoDB (for the website) ─────────────────────
  if (client.db) {
    const g = client.guilds.cache;
    client.db.updateBotStats({
      servers:  g.size,
      members:  g.reduce((a: number, b: any) => a + b.memberCount, 0),
      channels: g.reduce((a: number, b: any) => a + b.channels.cache.size, 0),
    }).catch((): null => null);
  }

  // ── Done ─────────────────────────────────────────────────────────────────────
  webhookLogger.logReady(client);
  console.log('[YAY!] Bot fully initialized and ready!');
}

// ─────────────────────────────────────────────────────────────────────────────
// Boot-block: cached data
// ─────────────────────────────────────────────────────────────────────────────

async function loadCachedDataBlock(client: LevitateClient): Promise<void> {
  const db = client.db;

  // Noprefix global state
  const noprefixEnabled = await db.getNoprefixGlobalEnabled().catch((): boolean => false);
  console.log(
    `[DATABASE - LOADING DATA] ✨ Noprefix is ${noprefixEnabled ? 'ENABLED' : 'DISABLED'}`,
  );

  // Guilds with noprefix disabled
  const disabledGuilds = await db.getNoPrefixDisabledGuilds().catch((): any[] => []);
  if (disabledGuilds.length > 0) {
    const names = disabledGuilds
      .map((d: any): string => client.guilds.cache.get(d.guild_id)?.name ?? d.guild_id)
      .join(', ');
    console.log(`[DATABASE - LOADING DATA] ✨ Guilds with noprefix disabled: ${names}`);
  } else {
    console.log(`[DATABASE - LOADING DATA] ✨ Guilds with noprefix disabled: (none)`);
  }

  // AFK cache warm-up
  const afkCount = await db.populateAfkCacheSilent().catch((): number => 0);
  console.log(`[DATABASE - LOADING DATA] 🪐 AFK cache populated: ${afkCount} active user(s)`);

  // Guild prefixes
  const prefixes = await db.getAllGuildPrefixes().catch((): Map<string, string> => new Map());
  console.log(`[DATABASE - LOADING DATA] ✨ Loaded ${prefixes.size} guild prefix(es)`);

  // User self-prefixes
  const userPrefixes = await db.getAllUserSelfPrefixes().catch((): Map<string, string> => new Map());
  client.userPrefixes = userPrefixes;
  console.log(`[DATABASE - LOADING DATA] ✨ Loaded ${userPrefixes.size} user self-prefix(es)`);

  // User command aliases
  const userAliases = await db.getAllUserAliases().catch((): Map<string, Map<string, string>> => new Map());
  client.userAliases = userAliases;
  const aliasCount = [...userAliases.values()].reduce((sum, m) => sum + m.size, 0);
  console.log(`[DATABASE - LOADING DATA] ✨ Loaded ${aliasCount} user command alias(es) across ${userAliases.size} user(s)`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Side-effects (fire-and-forget at end of boot)
// ─────────────────────────────────────────────────────────────────────────────

async function enforceBlacklistedServers(client: LevitateClient): Promise<void> {
  if (!client.db) return;
  const enabled = await client.db.getBlacklistServerGlobalEnabled().catch((): boolean => false);
  if (!enabled) return;

  const servers: any[] = await client.db.getBlacklistedServers().catch((): any[] => []);
  for (const server of servers) {
    const guild = client.guilds.cache.get(server.guild_id);
    if (!guild) continue;
    const channel: any = guild.channels.cache.find(
      (ch: any) => ch.type === 0 && ch.permissionsFor(guild.members.me)?.has('SendMessages'),
    );
    if (channel) {
      await blacklistedServer({ channel }, guild, client).catch((): null => null);
    }
    await guild.leave().catch((): null => null);
  }
}

async function sendPendingRestartNotification(client: LevitateClient): Promise<void> {
  if (!client.db) return;
  try {
    const pending = await client.db.getPendingRestartChannel();
    if (!pending) return;
    await client.db.clearPendingRestartChannel().catch((): null => null);

    const devId: string | undefined = client.config?.developers?.[0]?.[1];
    const mentionText = devId ? `<@${devId}>` : 'Developer';

    const container = new ContainerBuilder().addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `${emojis.blacktick} ${mentionText} Bot restarted successfully.`,
      ),
    );

    const payload: any = {
      components: [container],
      flags: MessageFlags.IsComponentsV2,
      allowedMentions: devId ? { users: [devId] } : { parse: [] },
    };

    let channel: any = null;
    if (pending.guildId) {
      const guild = client.guilds.cache.get(pending.guildId);
      channel = guild?.channels?.cache?.get(pending.channelId) ?? null;
    }
    if (!channel) {
      channel = await client.channels.fetch(pending.channelId).catch((): null => null);
    }
    if (channel?.send) {
      await channel.send(payload).catch((): null => null);
    }
  } catch {
    // Non-fatal
  }
}

bootstrap().catch((err: Error) => {
  console.error('[BOOTSTRAP] Failed to start:', err.message);
  process.exit(1);
});
