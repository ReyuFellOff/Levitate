// xoxo/commands/server/userinfo.ts
//
// $userinfo — shows detailed information about a user across four interactive
// tabs: About · Roles · Permissions · Assets.
//
// This file contains ONLY command metadata, data fetching, and collector logic.
// All CV2 payload construction lives in xoxo/components/utility/userinfo.ts.

import type { LevitateClient } from '../../structures/LevitateClient.js';
import { sendError }           from '../../components/statusMessages.js';
import { resolveUser }         from '../../helpers/userResolver.js';
import {
  buildPayload,
  makeIds,
  type UIState,
  type UserData,
} from '../../components/utility/userinfo.js';
import { authorOnlyFilter } from '../../helpers/panelGuard.js';

export const options = {
  name:        'userinfo',
  aliases:     ['ui', 'whois'] as string[],
  description: 'Show detailed information about a user.',
  usage:       'userinfo [@user | user ID | username]',
  category:    'server',
  owner:       false,
  cooldown:    5,
};

// ─────────────────────────────────────────────────────────────────────────────
// Data fetching — shared by both execute paths
// ─────────────────────────────────────────────────────────────────────────────

async function fetchUserData(
  client:  LevitateClient,
  guild:   any,
  rawUser: any,
): Promise<UserData | null> {
  // Force-fetch to get banner hash, latest avatar, and primaryGuild info.
  const fullUser = await client.users
    .fetch(rawUser.id, { force: true })
    .catch((): null => null);
  if (!fullUser) return null;

  // Force-fetch member so their guild-specific avatar/banner are populated.
  const member = await guild.members
    .fetch({ user: fullUser.id, force: true })
    .catch((): null => null);

  const globalAvatarUrl: string       = fullUser.displayAvatarURL({ size: 4096 });
  const serverAvatarUrl: string | null =
    member?.avatar ? (member.avatarURL({ size: 4096 }) ?? null) : null;

  const globalBannerUrl: string | null = fullUser.bannerURL({ size: 4096 }) ?? null;
  const serverBannerUrl: string | null = member?.bannerURL?.({ size: 4096 }) ?? null;

  const isOwner = guild.ownerId === fullUser.id;

  // ── Server-tag image URLs ────────────────────────────────────────────────
  // primaryGuild has: { identityGuildId, identityEnabled, tag, badge }
  // There is NO name field on this object — name must be sourced separately.
  const pg = (fullUser as any).primaryGuild as
    | { identityGuildId: string; identityEnabled: boolean; tag: string | null; badge: string | null }
    | null;

  // Discord.js exposes guildTagBadgeURL() on the User object (NOT primaryGuildBadgeURL).
  // CDN path: /guild-tag-badges/{guildId}/{badgeHash}
  const tagBadgeUrl: string | null =
    (fullUser as any).guildTagBadgeURL?.({ size: 1024, extension: 'png' }) ?? null;

  // Guild name resolution — four-stage exhaustive fallback.
  // Stage 1: guild cache   — instant, works if bot is a member.
  // Stage 2: widget.json unauthenticated — truly public HTTP request with no bot
  //          token; Discord evaluates only widget-enabled status, not membership.
  //          Covers public servers whose owner enabled the Server Widget.
  // Stage 3: widget.json authenticated  — with bot token; some edge cases differ.
  // Stage 4: guild preview — authenticated, works for Discord-discoverable guilds.
  // Stage 5: full guild fetch — authenticated GET /guilds/{id}; succeeds only if
  //          the bot is in the guild but it wasn't in the local cache (rare).
  // If all five fail, tagGuildName stays null → displayed as "Unknown [TAG]".
  const tagCachedGuild = pg?.identityGuildId
    ? (client.guilds.cache.get(pg.identityGuildId) ?? null)
    : null;

  let tagGuildIconUrl:   string | null = tagCachedGuild?.iconURL?.({ size: 1024 }) ?? null;
  const tagGuildBannerUrl: string | null = tagCachedGuild?.bannerURL?.({ size: 1024 }) ?? null;

  let tagGuildName: string | null = tagCachedGuild?.name ?? null;

  if (!tagGuildName && pg?.identityGuildId) {
    const gid = pg.identityGuildId;

    // Stage 2 — widget.json WITHOUT bot token (truly public, no auth header).
    // Sending the bot Authorization header can cause Discord to check bot
    // membership before checking widget status, returning 403 for guilds the
    // bot is not in even when the widget is enabled.  auth:false bypasses that.
    if (!tagGuildName) {
      try {
        const w = await (client.rest as any).get(`/guilds/${gid}/widget.json`, { auth: false });
        if (typeof (w as any)?.name === 'string') tagGuildName = (w as any).name;
      } catch { /* widget disabled — continue */ }
    }

    // Stage 3 — widget.json WITH bot token (fallback in case auth differs).
    if (!tagGuildName) {
      try {
        const w = await (client.rest as any).get(`/guilds/${gid}/widget.json`);
        if (typeof (w as any)?.name === 'string') tagGuildName = (w as any).name;
      } catch { /* widget disabled — continue */ }
    }

    // Stage 4 — guild preview (discoverable / lurkable guilds).
    // Also extracts the icon hash, which IS included in the preview object.
    if (!tagGuildName) {
      try {
        const preview = await (client.rest as any).get(`/guilds/${gid}/preview`);
        if (typeof (preview as any)?.name === 'string') {
          tagGuildName = (preview as any).name;
        }
        if (!tagGuildIconUrl && typeof (preview as any)?.icon === 'string') {
          const hash = (preview as any).icon as string;
          const ext  = hash.startsWith('a_') ? 'gif' : 'png';
          tagGuildIconUrl = `https://cdn.discordapp.com/icons/${gid}/${hash}.${ext}?size=1024`;
        }
      } catch { /* not discoverable — continue */ }
    }

    // Stage 5 — full guild fetch; only works if bot is in the guild.
    // Catches the case where the guild is accessible but not yet in local cache.
    if (!tagGuildName) {
      try {
        const g = await client.guilds.fetch(gid);
        tagGuildName = g.name;
        if (!tagGuildIconUrl) tagGuildIconUrl = g.iconURL({ size: 1024 }) ?? null;
      } catch { /* bot not in guild — all stages exhausted */ }
    }
  }

  return {
    user:            fullUser,
    member:          member ?? null,
    guild,
    displayName:     (fullUser.globalName as string | null) ?? fullUser.username,
    username:        fullUser.username,
    userId:          fullUser.id,
    isOwner,
    globalAvatarUrl,
    serverAvatarUrl,
    globalBannerUrl,
    serverBannerUrl,
    tagGuildName,
    tagBadgeUrl,
    tagGuildIconUrl,
    tagGuildBannerUrl,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Core runner — manages the collector; delegates all UI building to the
// component module.
// ─────────────────────────────────────────────────────────────────────────────

async function runUserInfo(
  channel:           any,
  sendFirst:         ((payload: any) => Promise<any>) | null,
  requesterId:       string,
  requesterUsername: string,
  uid:               string,
  data:              UserData,
): Promise<void> {
  const ids   = makeIds(uid);
  const state: UIState = {
    tab:           'about',
    avatarVariant: 'global',
    bannerVariant: data.globalBannerUrl ? 'global' : 'server',
    tagVariant:    data.tagBadgeUrl ? 'badge' : 'icon',
  };

  // All custom IDs this collector should handle.
  const allIds = new Set<string>(Object.values(ids));
  // Disabled download-placeholder button for banner also carries a custom ID.
  allIds.add(`${ids.bnGlobal}:dl`);

  const initialPayload = buildPayload(data, ids, state, false, requesterUsername);
  let msg: any;
  if (sendFirst) {
    msg = await sendFirst(initialPayload).catch((): null => null);
  } else {
    msg = await channel.send(initialPayload).catch((): null => null);
  }
  if (!msg) return;

  // Idle timeout: 3 minutes of inactivity disables all buttons.
  const collector = msg.createMessageComponentCollector({
    filter: (i: any) => authorOnlyFilter(i, requesterId, (cid) => allIds.has(cid)),
    idle:   3 * 60_000,
  });

  collector.on('collect', async (i: any) => {
    await i.deferUpdate().catch((): null => null);

    switch (i.customId) {
      case ids.about:     state.tab = 'about';             break;
      case ids.roles:     state.tab = 'roles';             break;
      case ids.perms:     state.tab = 'perms';             break;
      case ids.assets:    state.tab = 'assets';            break;
      case ids.avGlobal:  state.avatarVariant = 'global';  break;
      case ids.avServer:  state.avatarVariant = 'server';  break;
      case ids.bnGlobal:  state.bannerVariant = 'global';  break;
      case ids.bnServer:  state.bannerVariant = 'server';  break;
      case ids.tagBadge:  state.tagVariant = 'badge';      break;
      case ids.tagIcon:   state.tagVariant = 'icon';       break;
      // Disabled placeholder buttons do nothing.
    }

    await i.editReply(buildPayload(data, ids, state, false, requesterUsername)).catch((): null => null);
  });

  collector.on('end', async () => {
    await msg.edit(buildPayload(data, ids, state, true, requesterUsername)).catch((): null => null);
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Prefix execute
// ─────────────────────────────────────────────────────────────────────────────

export async function prefixExecute(
  message: any,
  args:    string[],
  client:  LevitateClient,
): Promise<any> {
  const ctx   = { message };
  const guild = message.guild;
  if (!guild) return sendError(ctx, 'This command can only be used in a server.');

  const rawUser = args.length
    ? await resolveUser(client, guild, args[0])
    : message.author;
  if (!rawUser) return sendError(ctx, 'User not found. Try a mention, user ID, or username.');

  const data = await fetchUserData(client, guild, rawUser);
  if (!data) return sendError(ctx, 'Failed to fetch user information. Please try again.');

  return runUserInfo(
    message.channel,
    null,
    message.author.id,
    message.author.username,
    message.id,
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

  const rawUser = (interaction.options.getUser('user') as any) ?? interaction.user;
  const data    = await fetchUserData(client, guild, rawUser);
  if (!data) return sendError(ctx, 'Failed to fetch user information. Please try again.');

  return runUserInfo(
    interaction.channel,
    (payload: any) => interaction.editReply(payload),
    interaction.user.id,
    interaction.user.username,
    interaction.id,
    data,
  );
}
