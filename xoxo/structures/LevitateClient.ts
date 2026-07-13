// xoxo/structures/LevitateClient.ts
//
// Extended discord.js Client. Construction is intentionally silent — no console
// output here. The boot sequence in `xoxo/levitate.ts` controls what prints and
// when. Each subsystem has its own init method so bootstrap can call them in
// order.
//
// Shard assignment is read from discord-hybrid-sharding's `getInfo()`, which
// reads environment variables injected by the ClusterManager in `index.ts`.
//
// Device icon (mobile / web):
//   If the matched BotInstance has displayStatus === 'mobile' or 'web', we
//   rewrite `this.ws.options.identifyProperties` right after super() — before
//   login — so Discord sees 'Discord Android' (mobile) or a browser signature
//   (web) in the IDENTIFY payload. Discord's presence protocol only has three
//   device buckets (desktop/mobile/web), so these are the only two spoofable
//   non-default icons.
//
// Initial presence:
//   StatusManager.buildInitialPresenceFor() is called before super() so the
//   activity can be passed via the Client constructor's `presence` option and
//   sent with the IDENTIFY packet.

import {
  Client,
  Collection,
  GatewayIntentBits,
  Partials,
} from 'discord.js';
import { SimpleShardingStrategy } from '@discordjs/ws';
import { ClusterClient, getInfo } from 'discord-hybrid-sharding';
import config from '../config.js';
import type { Database } from '../database/database.js';
import {
  findBotInstanceByClientId,
  firstDisplayStatus,
  instanceUsesMobile,
  instanceUsesWeb,
  type BotInstance,
} from '../config/botInstances.js';
import { StatusManager } from './StatusManager.js';

function buildClientOptions() {
  const matched = findBotInstanceByClientId(process.env['DISCORD_CLIENT_ID'] ?? null);
  const initial = StatusManager.buildInitialPresenceFor(matched);

  const ws: any = {};

  // Device icon — must be injected into the WS manager's identifyProperties
  // via buildStrategy, before the gateway IDENTIFY handshake. Setting it after
  // super() on this.ws.options no longer works in current discord.js/ws versions.
  if (matched && instanceUsesMobile(matched) && firstDisplayStatus(matched) === 'mobile') {
    ws.buildStrategy = (manager: any) => {
      manager.options.identifyProperties = {
        browser: 'Discord Android',
        os:      'android',
        device:  'discord-android',
      };
      return new SimpleShardingStrategy(manager);
    };
  } else if (matched && instanceUsesWeb(matched) && firstDisplayStatus(matched) === 'web') {
    ws.buildStrategy = (manager: any) => {
      manager.options.identifyProperties = {
        browser: 'Chrome',
        os:      'Windows',
        device:  '',
      };
      return new SimpleShardingStrategy(manager);
    };
  }

  // Initial presence sent with the IDENTIFY payload.
  if (initial) {
    ws.presence = {
      activities: initial.activities,
      status:     initial.status,
      afk:        false,
      since:      null,
    };
  }

  return { matched, ws };
}

export class LevitateClient extends Client {
  public cluster: ClusterClient<this>;
  public config        = config;
  public commands:      Collection<string, any>;
  public slashCommands: Collection<string, any>;
  public aliases:       Collection<string, string>;
  public cooldowns:     Collection<string, number>;
  /** Keyed helpers attached by helperLoader — access as `client.helpers.helperName`. */
  public helpers: Record<string, any> = {};
  /**
   * In-memory sticky-message cache.
   * Key: `"${guildId}-${channelId}"` → ID of the most recently posted sticky message.
   * Used as a loop guard so the sticky we just sent does not trigger another re-post.
   */
  public stickyMessages: Map<string, string> = new Map();
  /**
   * In-memory user self-prefix cache.
   * Key: userId → personal prefix string.
   * Populated at boot from DB; updated live when users set/remove their prefix.
   */
  public userPrefixes: Map<string, string> = new Map();
  /**
   * In-memory per-user command alias cache.
   * Key: userId → Map(alias_lower → canonical command name).
   * Populated at boot from DB; updated live when users create/delete aliases.
   * These are private to each user — never shared or globally resolvable.
   */
  public userAliases: Map<string, Map<string, string>> = new Map();
  /**
   * Database interface — populated once MongoDB is wired.
   * Until then, commands that call client.db must be guarded with `if (client.db)`.
   */
  public db!: Database;
  /**
   * Presence / status rotator — instantiated and started in levitate.ts after
   * the loaders have finished. May be undefined until that point.
   */
  public statusManager: StatusManager | undefined;
  /** The BotInstance entry matched at construction time (or null if none matched). */
  public matchedInstance: BotInstance | null;

  constructor() {
    const { matched, ws } = buildClientOptions();

    super({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildPresences,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.DirectMessages,
      ],
      partials: [
        Partials.Channel,
        Partials.Message,
        Partials.User,
        Partials.GuildMember,
      ],
      // Let discord-hybrid-sharding tell this cluster which shards it owns.
      shards:     getInfo().SHARD_LIST,
      shardCount: getInfo().TOTAL_SHARDS,
      rest: { timeout: 30_000, retries: 3 },
      ws,
    });

    this.matchedInstance = matched;
    this.cluster      = new ClusterClient(this);
    this.commands      = new Collection();
    this.slashCommands = new Collection();
    this.aliases       = new Collection();
    this.cooldowns     = new Collection();
  }

  /** Returns true if this instance is configured to show the mobile indicator. */
  usesMobileIndicator(): boolean {
    return !!(this.matchedInstance && instanceUsesMobile(this.matchedInstance));
  }

  /** Returns true if this instance is configured to show the web (browser) indicator. */
  usesWebIndicator(): boolean {
    return !!(this.matchedInstance && instanceUsesWeb(this.matchedInstance));
  }
}
