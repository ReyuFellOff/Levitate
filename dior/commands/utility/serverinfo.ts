// xoxo/commands/utility/serverinfo.ts
//
// $serverinfo — shows detailed information about the current server across
// five interactive tabs: Overview · Members · Channels · Security · Assets.
//
// This file contains ONLY command metadata, data fetching, and collector logic.
// All CV2 payload construction lives in xoxo/components/utility/serverinfo.ts.

import type { LevitateClient } from '../../structures/LevitateClient.js';
import { sendError }           from '../../components/statusMessages.js';
import {
  buildServerPayload,
  makeSIds,
  type AssetType,
  type ServerData,
  type ServerState,
} from '../../components/utility/serverinfo.js';
import { authorOnlyFilter } from '../../helpers/panelGuard.js';

export const options = {
  name:        'serverinfo',
  aliases:     ['si', 'guildinfo'] as string[],
  description: 'Show detailed information about this server across 5 interactive tabs.',
  usage:       'serverinfo',
  category:    'utility',
  owner:       false,
  cooldown:    5,
};

// ─────────────────────────────────────────────────────────────────────────────
// Data fetching
// ─────────────────────────────────────────────────────────────────────────────

async function fetchServerData(client: LevitateClient, guild: any): Promise<ServerData> {
  // Fetch guild owner tag
  let ownerTag: string | null = null;
  try {
    const owner = await client.users.fetch(guild.ownerId, { force: false });
    ownerTag = owner.globalName ?? owner.username ?? null;
  } catch { /* ignore */ }

  // Member breakdown — use cache
  const members = [...(guild.members?.cache?.values() ?? [])];
  const memberCount = guild.memberCount ?? members.length;
  const humanCount  = members.filter((m: any) => !m.user?.bot).length;
  const botCount    = members.filter((m: any) =>  m.user?.bot).length;

  // Presences — online members from cache
  const onlineCount = [...(guild.presences?.cache?.values() ?? [])]
    .filter((p: any) => p.status === 'online' || p.status === 'idle' || p.status === 'dnd')
    .length;

  // Asset URLs
  const iconUrl             = guild.iconURL?.({ size: 4096, extension: 'png' }) ?? null;
  const bannerUrl           = guild.bannerURL?.({ size: 4096 }) ?? null;
  const splashUrl           = guild.splashURL?.({ size: 4096 }) ?? null;
  const discoverySplashUrl  = guild.discoverySplashURL?.({ size: 4096 }) ?? null;

  return {
    guild,
    ownerTag,
    memberCount,
    onlineCount,
    humanCount,
    botCount,
    iconUrl,
    bannerUrl,
    splashUrl,
    discoverySplashUrl,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Core runner
// ─────────────────────────────────────────────────────────────────────────────

async function runServerInfo(
  channel:           any,
  sendFirst:         ((payload: any) => Promise<any>) | null,
  requesterId:       string,
  requesterUsername: string,
  data:              ServerData,
): Promise<void> {
  const ids   = makeSIds(data.guild.id);
  const state: ServerState = {
    tab:       'overview',
    assetType: data.iconUrl ? 'icon' : data.bannerUrl ? 'banner' : 'splash',
  };

  const allIds = new Set<string>(Object.values(ids));

  const initialPayload = buildServerPayload(data, ids, state, false, requesterUsername);
  let msg: any;
  if (sendFirst) {
    msg = await sendFirst(initialPayload).catch((): null => null);
  } else {
    msg = await channel.send(initialPayload).catch((): null => null);
  }
  if (!msg) return;

  const collector = msg.createMessageComponentCollector({
    filter: (i: any) => authorOnlyFilter(i, requesterId, (cid) => allIds.has(cid)),
    idle:   3 * 60_000,
  });

  collector.on('collect', async (i: any) => {
    await i.deferUpdate().catch((): null => null);

    switch (i.customId) {
      case ids.overview:       state.tab = 'overview';   break;
      case ids.community:      state.tab = 'community';  break;
      case ids.counts:         state.tab = 'counts';     break;
      case ids.security:       state.tab = 'security';   break;
      case ids.assets:         state.tab = 'assets';    break;
      case ids.assetIcon:      state.tab = 'assets'; state.assetType = 'icon';      break;
      case ids.assetBanner:    state.tab = 'assets'; state.assetType = 'banner';    break;
      case ids.assetSplash:    state.tab = 'assets'; state.assetType = 'splash';    break;
      case ids.assetDiscovery: state.tab = 'assets'; state.assetType = 'discovery'; break;
    }

    await i.editReply(buildServerPayload(data, ids, state, false, requesterUsername)).catch((): null => null);
  });

  collector.on('end', async () => {
    await msg.edit(buildServerPayload(data, ids, state, true, requesterUsername)).catch((): null => null);
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Prefix execute
// ─────────────────────────────────────────────────────────────────────────────

export async function prefixExecute(
  message: any,
  _args:   string[],
  client:  LevitateClient,
): Promise<any> {
  const ctx   = { message };
  const guild = message.guild;
  if (!guild) return sendError(ctx, 'This command can only be used in a server.');

  const data = await fetchServerData(client, guild);

  return runServerInfo(
    message.channel,
    null,
    message.author.id,
    message.author.username,
    data,
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Slash execute
// ─────────────────────────────────────────────────────────────────────────────

export async function slashExecute(
  interaction: any,
  client:      LevitateClient,
): Promise<any> {
  await interaction.deferReply();
  const ctx   = { interaction };
  const guild = interaction.guild;
  if (!guild) return sendError(ctx, 'This command can only be used in a server.');

  const data = await fetchServerData(client, guild);

  return runServerInfo(
    interaction.channel,
    (payload: any) => interaction.editReply(payload),
    interaction.user.id,
    interaction.user.username,
    data,
  );
}
