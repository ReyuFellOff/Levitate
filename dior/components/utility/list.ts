// xoxo/components/utility/list.ts
//
// CV2 payload builders, session tracking, and interaction handlers for $list.
//
// Paginated lists of server entities: roles, members, emojis, stickers,
// channels, bans. 25 items per page via StringSelectMenu + Prev/Next buttons.
// Selecting an item opens a rich detail panel with full entity information.
//
// customId routing (interactionCreate.ts):
//   StringSelectMenu → 'list:select'
//   Button           → 'list:prev' | 'list:next' | 'list:back'

import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  MessageFlags,
  SeparatorBuilder,
  SectionBuilder,
  ThumbnailBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  TextDisplayBuilder,
} from 'discord.js';
import { config } from '../../config.js';
import type { LevitateClient } from '../../structures/LevitateClient.js';
import { emojis } from '../../emojis.js';

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const INACTIVITY_MS = 5 * 60 * 1_000;
const PAGE_SIZE     = 25;

export type ListType =
  | 'roles'
  | 'members'
  | 'bots'
  | 'boosters'
  | 'emojis'
  | 'stickers'
  | 'channels'
  | 'bans'
  | 'invites';

const TYPE_EMOJI: Record<ListType, string> = {
  roles:    emojis.blackCards,
  members:  emojis.whiteCards,
  bots:     emojis.blackButterfly,
  boosters: emojis.blackflower,
  emojis:   emojis.blackflower,
  stickers: emojis.whiteArrow,
  channels: emojis.blackcrown,
  bans:     emojis.whiteButterflies,
  invites:  emojis.bluePlanet,
};

const TYPE_LABEL: Record<ListType, string> = {
  roles:    'Roles',
  members:  'Members',
  bots:     'Bots',
  boosters: 'Boosters',
  emojis:   'Emojis',
  stickers: 'Stickers',
  channels: 'Channels',
  bans:     'Bans',
  invites:  'Invites',
};

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface ListSession {
  userId:    string;
  channelId: string;
  guildId:   string;
  listType:  ListType;
  items:     any[];       // raw entity array
  page:      number;
  detailId:  string | null; // currently showing detail for this ID
  client:    LevitateClient;
}

// ─────────────────────────────────────────────────────────────────────────────
// Session tracking
// ─────────────────────────────────────────────────────────────────────────────

export const listSessions  = new Map<string, ListSession>();
const listTimeouts         = new Map<string, NodeJS.Timeout>();

export function registerListSession(messageId: string, session: ListSession): void {
  listSessions.set(messageId, session);
  resetListTimeout(messageId);
}

export function resetListTimeout(messageId: string): void {
  const session = listSessions.get(messageId);
  if (!session) return;

  clearTimeout(listTimeouts.get(messageId));

  const timeout = setTimeout(async () => {
    try {
      const channel = await session.client.channels.fetch(session.channelId);
      const msg     = await (channel as any).messages.fetch(messageId);
      await msg.edit(buildListPayload(session, true));
    } catch { /* deleted or inaccessible */ }
    finally {
      listSessions.delete(messageId);
      listTimeouts.delete(messageId);
    }
  }, INACTIVITY_MS);

  listTimeouts.set(messageId, timeout);
}

// ─────────────────────────────────────────────────────────────────────────────
// Data fetching per type
// ─────────────────────────────────────────────────────────────────────────────

export async function fetchListItems(guild: any, type: ListType): Promise<any[]> {
  switch (type) {
    case 'roles': {
      return [...guild.roles.cache.values()]
        .filter((r: any) => r.id !== guild.id)
        .sort((a: any, b: any) => b.position - a.position);
    }
    case 'members': {
      return [...guild.members.cache.values()]
        .filter((m: any) => !m.user?.bot)
        .sort((a: any, b: any) =>
          (a.displayName ?? a.user?.username ?? '').localeCompare(b.displayName ?? b.user?.username ?? ''),
        );
    }
    case 'bots': {
      return [...guild.members.cache.values()]
        .filter((m: any) => m.user?.bot)
        .sort((a: any, b: any) =>
          (a.user?.username ?? '').localeCompare(b.user?.username ?? ''),
        );
    }
    case 'boosters': {
      return [...guild.members.cache.values()]
        .filter((m: any) => m.premiumSince != null)
        .sort((a: any, b: any) => (a.premiumSinceTimestamp ?? 0) - (b.premiumSinceTimestamp ?? 0));
    }
    case 'emojis': {
      return [...guild.emojis.cache.values()];
    }
    case 'stickers': {
      try {
        return [...(await guild.stickers.fetch()).values()];
      } catch { return []; }
    }
    case 'channels': {
      return [...guild.channels.cache.values()]
        .filter((c: any) => c.type !== 4) // skip category channels
        .sort((a: any, b: any) => (a.rawPosition ?? 0) - (b.rawPosition ?? 0));
    }
    case 'bans': {
      try {
        const bans = await guild.bans.fetch();
        return [...bans.values()];
      } catch { return []; }
    }
    case 'invites': {
      try {
        const inv = await guild.invites.fetch();
        // Normalise to plain objects so item.id === item.code works for detail lookup
        return [...inv.values()].map((i: any) => ({
          id:               i.code,
          code:             i.code,
          url:              i.url,
          inviter:          i.inviter  ?? null,
          channel:          i.channel  ?? null,
          uses:             i.uses     ?? 0,
          maxUses:          i.maxUses  ?? 0,
          maxAge:           i.maxAge   ?? 0,
          temporary:        i.temporary ?? false,
          createdTimestamp: i.createdTimestamp ?? null,
          expiresTimestamp: i.expiresTimestamp ?? null,
          memberCount:      i.memberCount ?? null,
        }));
      } catch { return []; }
    }
    default:
      return [];
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Formatting helpers for the LIST view
// ─────────────────────────────────────────────────────────────────────────────

function formatListLine(type: ListType, item: any, index: number): string {
  const n = index + 1;
  switch (type) {
    case 'roles': {
      const color = item.hexColor !== '#000000' ? `\`${item.hexColor}\`` : '`No Color`';
      const memberCount = item.members?.size ?? 0;
      const flags: string[] = [];
      if (item.hoist)       flags.push('Hoisted');
      if (item.mentionable) flags.push('Mentionable');
      if (item.managed)     flags.push('Managed');
      const flagStr = flags.length ? ` · ${flags.join(' · ')}` : '';
      return `**${n}.** ${color} <@&${item.id}> — ${memberCount} member${memberCount !== 1 ? 's' : ''}${flagStr}`;
    }
    case 'members': {
      const name = item.nickname ?? item.user?.globalName ?? item.user?.username ?? 'Unknown';
      const joined = item.joinedTimestamp
        ? `joined <t:${Math.floor(item.joinedTimestamp / 1000)}:R>`
        : 'join date unknown';
      return `**${n}.** **${name}** (\`${item.user?.username ?? item.user?.id ?? item.id}\`) — ${joined}`;
    }
    case 'bots': {
      const username = item.user?.username ?? 'Unknown';
      const joined = item.joinedTimestamp
        ? `added <t:${Math.floor(item.joinedTimestamp / 1000)}:R>`
        : 'date unknown';
      return `**${n}.** **${username}** (\`${item.user?.id ?? item.id}\`) — ${joined}`;
    }
    case 'boosters': {
      const name = item.nickname ?? item.user?.globalName ?? item.user?.username ?? 'Unknown';
      const since = item.premiumSinceTimestamp
        ? `boosting since <t:${Math.floor(item.premiumSinceTimestamp / 1000)}:R>`
        : 'start date unknown';
      return `**${n}.** **${name}** (\`${item.user?.username ?? item.user?.id ?? item.id}\`) — ${since}`;
    }
    case 'emojis': {
      const ext  = item.animated ? 'gif' : 'png';
      const url  = item.imageURL?.({ size: 32, extension: ext }) ?? item.url;
      const type = item.animated ? 'Animated' : 'Static';
      return `**${n}.** [${item.name}](${url}) — ${type}`;
    }
    case 'stickers':
      return `**${n}.** \`${item.name}\` — Format: ${item.format}${item.tags ? ` · ${item.tags}` : ''}`;
    case 'channels': {
      const typeNames: Record<number, string> = {
        0: 'Text', 2: 'Voice', 5: 'Announcement', 10: 'Ann. Thread',
        11: 'Thread', 12: 'Priv. Thread', 13: 'Stage', 15: 'Forum', 16: 'Media',
      };
      const typeName = typeNames[item.type] ?? 'Other';
      const nsfw = item.nsfw ? ' · 🔞' : '';
      const slow = item.rateLimitPerUser ? ` · ${item.rateLimitPerUser}s slowmode` : '';
      return `**${n}.** <#${item.id}> — ${typeName}${nsfw}${slow}`;
    }
    case 'bans': {
      const user = item.user;
      const reason = item.reason ? item.reason.slice(0, 60) + (item.reason.length > 60 ? '…' : '') : 'No reason';
      return `**${n}.** **${user?.globalName ?? user?.username ?? 'Unknown'}** (\`${user?.id ?? 'Unknown'}\`) — ${reason}`;
    }
    case 'invites': {
      const inviterName = item.inviter
        ? (item.inviter.globalName ?? item.inviter.username ?? 'Unknown')
        : 'Deleted User';
      const channelMention = item.channel?.id ? `<#${item.channel.id}>` : 'Unknown Channel';
      const usesStr = item.maxUses > 0
        ? `${item.uses}/${item.maxUses} uses`
        : `${item.uses} uses`;
      const expiresStr = item.expiresTimestamp
        ? `expires <t:${Math.floor(item.expiresTimestamp / 1000)}:R>`
        : 'no expiry';
      return `**${n}.** [\`discord.gg/${item.code}\`](${item.url}) — by **${inviterName}** in ${channelMention} · ${usesStr} · ${expiresStr}`;
    }
  }
}

function selectDescription(type: ListType, item: any): string {
  switch (type) {
    case 'roles':
      return `${item.members?.size ?? '?'} members · Pos. ${item.position}${item.hoist ? ' · Hoisted' : ''}`;
    case 'members':
      return `ID: ${item.user?.id ?? item.id}`;
    case 'bots':
      return `ID: ${item.user?.id ?? item.id}`;
    case 'boosters':
      return item.premiumSinceTimestamp
        ? `Boosting since ${new Date(item.premiumSinceTimestamp).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}`
        : 'Booster';
    case 'emojis':
      return item.animated ? 'Animated emoji' : 'Static emoji';
    case 'stickers':
      return item.tags ?? 'No tags';
    case 'channels': {
      const typeNames: Record<number, string> = {
        0: 'Text', 2: 'Voice', 4: 'Category', 5: 'Announcement',
        13: 'Stage', 15: 'Forum', 16: 'Media',
      };
      return `${typeNames[item.type] ?? 'Channel'} · ID: ${item.id}`;
    }
    case 'bans':
      return item.reason?.slice(0, 100) ?? 'No reason provided';
    case 'invites': {
      const usesStr = item.maxUses > 0 ? `${item.uses}/${item.maxUses} uses` : `${item.uses} uses`;
      const expiry  = item.expiresTimestamp
        ? `expires <t:${Math.floor(item.expiresTimestamp / 1000)}:R>`
        : 'no expiry';
      return `${usesStr} · ${expiry}`.slice(0, 100);
    }
  }
}

function selectLabel(type: ListType, item: any): string {
  switch (type) {
    case 'roles':     return item.name.slice(0, 100);
    case 'members':   return (item.nickname ?? item.user?.globalName ?? item.user?.username ?? 'Unknown').slice(0, 100);
    case 'bots':      return (item.user?.username ?? 'Unknown').slice(0, 100);
    case 'boosters':  return (item.nickname ?? item.user?.globalName ?? item.user?.username ?? 'Unknown').slice(0, 100);
    case 'emojis':    return item.name.slice(0, 100);
    case 'stickers':  return item.name.slice(0, 100);
    case 'channels':  return `#${item.name}`.slice(0, 100);
    case 'bans':      return (item.user?.globalName ?? item.user?.username ?? 'Unknown').slice(0, 100);
    case 'invites':   return `discord.gg/${item.code}`.slice(0, 100);
  }
}

function selectValue(type: ListType, item: any): string {
  // GuildBan objects expose .id via a getter (== user.id); fall back to user.id for safety
  if (type === 'bans')     return item.user?.id ?? item.id ?? '';
  if (type === 'bots')     return item.id;
  if (type === 'boosters') return item.id;
  if (type === 'invites')  return item.code;
  return item.id;
}

// ─────────────────────────────────────────────────────────────────────────────
// Payload builder — list view
// ─────────────────────────────────────────────────────────────────────────────

export function buildListPayload(session: ListSession, disabled = false): any {
  const { items, listType, page, detailId } = session;

  if (detailId) {
    const item = items.find((i: any) => i.id === detailId);
    if (item) return buildDetailPayload(session, item, disabled);
  }

  const totalPages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  const safePage   = Math.min(Math.max(page, 0), totalPages - 1);
  const pageItems  = items.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);
  const offset     = safePage * PAGE_SIZE;

  const listLines = pageItems.map((item: any, i: number) =>
    formatListLine(listType, item, offset + i),
  );

  const selectOptions = pageItems.map((item: any) =>
    new StringSelectMenuOptionBuilder()
      .setValue(selectValue(listType, item))
      .setLabel(selectLabel(listType, item))
      .setDescription(selectDescription(listType, item).slice(0, 100)),
  );

  const menu = new StringSelectMenuBuilder()
    .setCustomId('list:select')
    .setPlaceholder(`Select a ${TYPE_LABEL[listType].toLowerCase()} for full details…`)
    .addOptions(selectOptions)
    .setDisabled(disabled || selectOptions.length === 0);

  const prevBtn = new ButtonBuilder()
    .setCustomId('list:prev')
    .setLabel('← Prev')
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(disabled || safePage === 0);

  const nextBtn = new ButtonBuilder()
    .setCustomId('list:next')
    .setLabel('Next →')
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(disabled || safePage >= totalPages - 1);

  const pageBtn = new ButtonBuilder()
    .setCustomId('list:noop')
    .setLabel(`${safePage + 1} / ${totalPages}`)
    .setStyle(ButtonStyle.Primary)
    .setDisabled(true);

  const start = safePage * PAGE_SIZE + 1;
  const end   = Math.min((safePage + 1) * PAGE_SIZE, items.length);

  const titleLine = `## ${TYPE_EMOJI[listType]} ${TYPE_LABEL[listType]} — ${items.length} total`;
  const countLine = totalPages > 1
    ? `Showing **${start}–${end}** of **${items.length}** ${TYPE_LABEL[listType].toLowerCase()}.`
    : `${items.length} ${TYPE_LABEL[listType].toLowerCase()}${items.length === 1 ? '' : 's'} in this server.`;

  const footer = disabled
    ? '-# This session has timed out. Run the command again to browse.'
    : '-# Select an item from the dropdown below to view its full details.';

  const container = new ContainerBuilder()
    .setAccentColor(parseInt(config.defaultAccentColor.replace('#', ''), 16))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(titleLine))
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(countLine))
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(listLines.join('\n') || 'Nothing to display.'),
    )
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
    .addActionRowComponents(
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu) as any,
    );

  if (totalPages > 1) {
    container.addActionRowComponents(
      new ActionRowBuilder<ButtonBuilder>().addComponents(prevBtn, pageBtn, nextBtn),
    );
  }

  container.addTextDisplayComponents(new TextDisplayBuilder().setContent(footer));

  return { components: [container], flags: MessageFlags.IsComponentsV2, allowedMentions: { parse: [] } };
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers for detail view
// ─────────────────────────────────────────────────────────────────────────────

function ts(ms: number): string {
  const s = Math.floor(ms / 1000);
  return `<t:${s}:F> (<t:${s}:R>)`;
}

function permList(perms: string[]): string {
  if (!perms.length) return 'None';
  const chunks: string[] = [];
  for (let i = 0; i < perms.length; i += 3) {
    chunks.push(perms.slice(i, i + 3).map((p: string) => `\`${p}\``).join(', '));
  }
  return chunks.join('\n');
}

export function buildRoleInfoPayload(
  item: any,
  includeNavigation = false,
  disabled = false,
): any {
  const perms = item.permissions?.toArray?.() ?? [];
  const iconUrl: string | null = item.iconURL?.() ?? null;
  const managedLine = item.managed ? '**Managed:** Yes (Integration/Bot role)' : null;

  const tags: string[] = [];
  if (item.tags?.premiumSubscriberRole) tags.push('Boost Subscriber Role');
  if (item.tags?.botId)                tags.push(`Bot Role (\`${item.tags.botId}\`)`);
  if (item.tags?.integrationId)        tags.push(`Integration (\`${item.tags.integrationId}\`)`);
  if (item.tags?.guildConnections)     tags.push('Linked Role');
  if (item.tags?.availableForPurchase) tags.push('Available for Purchase');
  const tagsLine = tags.length ? `**Tags:** ${tags.join(' · ')}` : null;
  const unicodeEmoji = item.unicodeEmoji ? `**Emoji:** ${item.unicodeEmoji}` : null;
  const memberSize = item.members?.size ?? 0;

  const lines = [
    `${emojis.whiteArrow} **__Role Info__**`,
    `**Name:** ${item.name}`,
    `**Mention:** <@&${item.id}>`,
    `**ID:** \`${item.id}\``,
    `**Color:** ${item.hexColor !== '#000000' ? item.hexColor : 'Default (no color)'}`,
    `**Position:** ${item.position} / ${(item.guild?.roles?.cache?.size ?? 1) - 1}`,
    `**Members with Role:** ${memberSize.toLocaleString()}`,
    `**Hoisted:** ${item.hoist ? 'Yes' : 'No'}`,
    `**Mentionable:** ${item.mentionable ? 'Yes' : 'No'}`,
    managedLine,
    tagsLine,
    unicodeEmoji,
    `**Created:** ${ts(item.createdTimestamp)}`,
  ].filter(Boolean).join('\n');

  const permText = perms.length
    ? `**Permissions (${perms.length}):**\n${permList(perms)}`
    : '**Permissions:** None';

  const container = new ContainerBuilder()
    .setAccentColor(parseInt(config.defaultAccentColor.replace('#', ''), 16))
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `## ${TYPE_EMOJI.roles} ${TYPE_LABEL.roles} — Details`,
      ),
    )
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true));

  if (iconUrl) {
    container.addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(lines))
        .setThumbnailAccessory(new ThumbnailBuilder().setURL(iconUrl)),
    );
  } else {
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(lines));
  }

  container
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(permText));

  if (includeNavigation) {
    container
      .addActionRowComponents(
        new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId('list:back')
            .setLabel('Back to List')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(disabled),
        ),
      );
  }

  return {
    components: [container],
    flags: MessageFlags.IsComponentsV2,
    allowedMentions: { parse: [] },
  };
}

function channelTypeFull(type: number): string {
  const m: Record<number, string> = {
    0: 'Text Channel', 2: 'Voice Channel', 5: 'Announcement Channel',
    10: 'Announcement Thread', 11: 'Public Thread', 12: 'Private Thread',
    13: 'Stage Channel', 15: 'Forum Channel', 16: 'Media Channel',
  };
  return m[type] ?? 'Unknown Channel Type';
}

// ─────────────────────────────────────────────────────────────────────────────
// Payload builder — detail view (per entity type)
// ─────────────────────────────────────────────────────────────────────────────

function buildDetailPayload(session: ListSession, item: any, disabled = false): any {
  const { listType } = session;

  if (listType === 'roles') return buildRoleInfoPayload(item, true, disabled);

  const backBtn = new ButtonBuilder()
    .setCustomId('list:back')
    .setLabel('← Back to List')
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(disabled);

  const container = new ContainerBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `## ${TYPE_EMOJI[listType]} ${TYPE_LABEL[listType]} — Details`,
      ),
    )
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true));

  switch (listType) {

    // ── Member ────────────────────────────────────────────────────────────────
    case 'members': {
      const user      = item.user;
      const joined    = item.joinedTimestamp ? ts(item.joinedTimestamp) : 'Unknown';
      const registered = user?.createdTimestamp ? ts(user.createdTimestamp) : 'Unknown';

      // Boost info
      const boostSince = item.premiumSince
        ? ts(item.premiumSinceTimestamp)
        : null;

      // Roles (up to 20 displayed, excluding @everyone)
      const memberRoles: any[] = item.roles?.cache
        ? [...item.roles.cache.values()].filter((r: any) => r.id !== session.guildId).sort((a: any, b: any) => b.position - a.position)
        : [];

      const rolesDisplay = memberRoles.length
        ? memberRoles.slice(0, 20).map((r: any) => `<@&${r.id}>`).join(' ')
          + (memberRoles.length > 20 ? `\n*…and ${memberRoles.length - 20} more*` : '')
        : 'None';

      const highestRole = memberRoles[0] ? `<@&${memberRoles[0].id}>` : 'None';
      const roleColor   = memberRoles.find((r: any) => r.color !== 0)?.hexColor ?? 'Default';

      // Key flags
      const flags: string[] = [];
      if (item.user?.bot)         flags.push('Bot');
      if (item.premiumSince)      flags.push('Server Booster');
      if (item.pending)           flags.push('Pending Verification');

      // Timeout info
      const timedOut = item.communicationDisabledUntil && item.communicationDisabledUntil > new Date()
        ? ts(item.communicationDisabledUntil.getTime())
        : null;

      // Key permissions
      const hasAdmin = item.permissions?.has?.('Administrator');
      const hasManageGuild = item.permissions?.has?.('ManageGuild');
      const hasBanMembers  = item.permissions?.has?.('BanMembers');
      const hasKickMembers = item.permissions?.has?.('KickMembers');
      const hasModMembers  = item.permissions?.has?.('ModerateMembers');

      const keyPerms: string[] = [];
      if (hasAdmin)       keyPerms.push('Administrator');
      if (hasManageGuild) keyPerms.push('Manage Guild');
      if (hasBanMembers)  keyPerms.push('Ban Members');
      if (hasKickMembers) keyPerms.push('Kick Members');
      if (hasModMembers)  keyPerms.push('Moderate Members');

      const avatarUrl = item.avatar
        ? (item.avatarURL?.({ size: 256 }) ?? user?.displayAvatarURL?.({ size: 256 }) ?? null)
        : (user?.displayAvatarURL?.({ size: 256 }) ?? null);

      const infoLines = [
        `${emojis.whiteArrow} **__Member Info__**`,
        `**Name:** ${user?.globalName ?? user?.username ?? 'Unknown'}`,
        `**Username:** \`${user?.username ?? 'Unknown'}\``,
        user?.discriminator && user.discriminator !== '0'
          ? `**Discriminator:** #${user.discriminator}` : null,
        `**User ID:** \`${user?.id ?? item.id}\``,
        `**Nickname:** ${item.nickname ?? 'None'}`,
        flags.length ? `**Flags:** ${flags.join(' · ')}` : null,
        '',
        `${emojis.whiteArrow} **__Timestamps__**`,
        `**Account Created:** ${registered}`,
        `**Joined Server:** ${joined}`,
        boostSince ? `**Boosting Since:** ${boostSince}` : null,
        timedOut   ? `**Timed Out Until:** ${timedOut}` : null,
        '',
        `${emojis.whiteArrow} **__Roles (${memberRoles.length})__**`,
        `**Highest Role:** ${highestRole}`,
        `**Color:** ${roleColor}`,
        `**Roles:** ${rolesDisplay}`,
        keyPerms.length ? `\n${emojis.whiteArrow} **__Key Permissions__**\n${keyPerms.map((p: string) => `\`${p}\``).join(', ')}` : null,
      ].filter(Boolean).join('\n');

      if (avatarUrl) {
        container.addSectionComponents(
          new SectionBuilder()
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(infoLines))
            .setThumbnailAccessory(new ThumbnailBuilder().setURL(avatarUrl)),
        );
      } else {
        container.addTextDisplayComponents(new TextDisplayBuilder().setContent(infoLines));
      }
      break;
    }

    // ── Bot ───────────────────────────────────────────────────────────────────
    case 'bots': {
      const user       = item.user;
      const joined     = item.joinedTimestamp ? ts(item.joinedTimestamp) : 'Unknown';
      const registered = user?.createdTimestamp ? ts(user.createdTimestamp) : 'Unknown';

      // Roles (excluding @everyone)
      const botRoles: any[] = item.roles?.cache
        ? [...item.roles.cache.values()]
            .filter((r: any) => r.id !== session.guildId)
            .sort((a: any, b: any) => b.position - a.position)
        : [];

      const rolesDisplay = botRoles.length
        ? botRoles.slice(0, 15).map((r: any) => `<@&${r.id}>`).join(' ')
            + (botRoles.length > 15 ? `\n*…and ${botRoles.length - 15} more*` : '')
        : 'None';

      const highestRole = botRoles[0] ? `<@&${botRoles[0].id}>` : 'None';

      // Managed role (the integration role for this bot, if any)
      const managedRole = botRoles.find((r: any) => r.managed && r.tags?.botId === user?.id);
      const managedRoleLine = managedRole ? `**Integration Role:** <@&${managedRole.id}>` : null;

      // Key permissions
      const keyPerms: string[] = [];
      if (item.permissions?.has?.('Administrator'))    keyPerms.push('Administrator');
      if (item.permissions?.has?.('ManageGuild'))      keyPerms.push('Manage Guild');
      if (item.permissions?.has?.('ManageChannels'))   keyPerms.push('Manage Channels');
      if (item.permissions?.has?.('ManageMessages'))   keyPerms.push('Manage Messages');
      if (item.permissions?.has?.('BanMembers'))       keyPerms.push('Ban Members');
      if (item.permissions?.has?.('KickMembers'))      keyPerms.push('Kick Members');
      if (item.permissions?.has?.('ManageWebhooks'))   keyPerms.push('Manage Webhooks');
      if (item.permissions?.has?.('ManageRoles'))      keyPerms.push('Manage Roles');
      if (item.permissions?.has?.('MentionEveryone'))  keyPerms.push('Mention Everyone');

      const avatarUrl = user?.displayAvatarURL?.({ size: 256 }) ?? null;

      const infoLines = [
        `${emojis.whiteArrow} **__Bot Info__**`,
        `**Username:** \`${user?.username ?? 'Unknown'}\``,
        `**User ID:** \`${user?.id ?? item.id}\``,
        `**Nickname:** ${item.nickname ?? 'None'}`,
        `**Account Created:** ${registered}`,
        `**Added to Server:** ${joined}`,
        '',
        `${emojis.whiteArrow} **__Roles (${botRoles.length})__**`,
        `**Highest Role:** ${highestRole}`,
        managedRoleLine,
        `**Roles:** ${rolesDisplay}`,
        keyPerms.length
          ? `\n${emojis.whiteArrow} **__Key Permissions__**\n${keyPerms.map((p: string) => `\`${p}\``).join(', ')}`
          : null,
      ].filter(Boolean).join('\n');

      if (avatarUrl) {
        container.addSectionComponents(
          new SectionBuilder()
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(infoLines))
            .setThumbnailAccessory(new ThumbnailBuilder().setURL(avatarUrl)),
        );
      } else {
        container.addTextDisplayComponents(new TextDisplayBuilder().setContent(infoLines));
      }
      break;
    }

    // ── Booster ───────────────────────────────────────────────────────────────
    case 'boosters': {
      const user       = item.user;
      const joined     = item.joinedTimestamp ? ts(item.joinedTimestamp) : 'Unknown';
      const registered = user?.createdTimestamp ? ts(user.createdTimestamp) : 'Unknown';
      const boostSince = item.premiumSinceTimestamp ? ts(item.premiumSinceTimestamp) : 'Unknown';

      // Roles (excluding @everyone)
      const memberRoles: any[] = item.roles?.cache
        ? [...item.roles.cache.values()]
            .filter((r: any) => r.id !== session.guildId)
            .sort((a: any, b: any) => b.position - a.position)
        : [];

      const rolesDisplay = memberRoles.length
        ? memberRoles.slice(0, 15).map((r: any) => `<@&${r.id}>`).join(' ')
            + (memberRoles.length > 15 ? `\n*…and ${memberRoles.length - 15} more*` : '')
        : 'None';

      const avatarUrl = item.avatar
        ? (item.avatarURL?.({ size: 256 }) ?? user?.displayAvatarURL?.({ size: 256 }) ?? null)
        : (user?.displayAvatarURL?.({ size: 256 }) ?? null);

      const infoLines = [
        `${emojis.whiteArrow} **__Booster Info__**`,
        `**Name:** ${user?.globalName ?? user?.username ?? 'Unknown'}`,
        `**Username:** \`${user?.username ?? 'Unknown'}\``,
        `**User ID:** \`${user?.id ?? item.id}\``,
        `**Nickname:** ${item.nickname ?? 'None'}`,
        '',
        `${emojis.whiteArrow} **__Timestamps__**`,
        `**Account Created:** ${registered}`,
        `**Joined Server:** ${joined}`,
        `**Boosting Since:** ${boostSince}`,
        '',
        `${emojis.whiteArrow} **__Roles (${memberRoles.length})__**`,
        `**Roles:** ${rolesDisplay}`,
      ].filter(Boolean).join('\n');

      if (avatarUrl) {
        container.addSectionComponents(
          new SectionBuilder()
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(infoLines))
            .setThumbnailAccessory(new ThumbnailBuilder().setURL(avatarUrl)),
        );
      } else {
        container.addTextDisplayComponents(new TextDisplayBuilder().setContent(infoLines));
      }
      break;
    }

    // ── Emoji ─────────────────────────────────────────────────────────────────
    case 'emojis': {
      const ext = item.animated ? 'gif' : 'png';
      const url = item.imageURL?.({ size: 512, extension: ext }) ?? item.url;

      const managed = item.managed ? 'Yes (External / Integration)' : 'No';
      const available = item.available !== false ? 'Yes' : 'No (Unavailable — likely boost tier lost)';

      // Creator info if available
      const authorLine = item.author
        ? `**Added by:** ${item.author.globalName ?? item.author.username ?? 'Unknown'}`
        : null;

      const lines = [
        `${emojis.whiteArrow} **__Emoji Info__**`,
        `**Name:** \`${item.name}\``,
        `**ID:** \`${item.id}\``,
        `**Type:** ${item.animated ? 'Animated (GIF)' : 'Static (PNG)'}`,
        `**Managed:** ${managed}`,
        `**Available:** ${available}`,
        `**Requires Colons:** ${item.requiresColons !== false ? 'Yes' : 'No'}`,
        authorLine,
        `**Created:** ${ts(item.createdTimestamp)}`,
        `**Usage:** \`<${item.animated ? 'a' : ''}:${item.name}:${item.id}>\``,
        `**URL:** [Open in browser](${url})`,
      ].filter(Boolean).join('\n');

      container
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(lines))
        .addMediaGalleryComponents(
          new MediaGalleryBuilder().addItems(
            new MediaGalleryItemBuilder().setURL(url).setDescription(item.name),
          ),
        )
        .addActionRowComponents(
          new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder().setURL(url).setLabel('Open Image').setStyle(ButtonStyle.Link),
          ),
        );
      break;
    }

    // ── Sticker ───────────────────────────────────────────────────────────────
    case 'stickers': {
      const formatLabel: Record<string, string> = {
        PNG: 'Static PNG', APNG: 'Animated PNG', GIF: 'GIF', LOTTIE: 'Lottie (Animated)',
      };

      const lines = [
        `${emojis.whiteArrow} **__Sticker Info__**`,
        `**Name:** \`${item.name}\``,
        `**ID:** \`${item.id}\``,
        `**Description:** ${item.description ?? 'None'}`,
        `**Format:** ${formatLabel[item.format] ?? item.format}`,
        `**Tags:** ${item.tags ?? 'None'}`,
        item.available !== undefined ? `**Available:** ${item.available ? 'Yes' : 'No'}` : null,
        `**Created:** ${ts(item.createdTimestamp)}`,
        `**URL:** [Open in browser](${item.url})`,
      ].filter(Boolean).join('\n');

      container
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(lines))
        .addMediaGalleryComponents(
          new MediaGalleryBuilder().addItems(
            new MediaGalleryItemBuilder().setURL(item.url).setDescription(item.name),
          ),
        )
        .addActionRowComponents(
          new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder().setURL(item.url).setLabel('Open Sticker').setStyle(ButtonStyle.Link),
          ),
        );
      break;
    }

    // ── Channel ───────────────────────────────────────────────────────────────
    case 'channels': {
      // Parent category
      const parentName = item.parent?.name ? `\`${item.parent.name}\`` : 'None';

      // Slowmode formatting
      const slowmode = item.rateLimitPerUser
        ? (() => {
            const secs = item.rateLimitPerUser;
            if (secs < 60)  return `${secs}s`;
            if (secs < 3600) return `${Math.floor(secs / 60)}m ${secs % 60}s`.replace(/ 0s/, '');
            return `${Math.floor(secs / 3600)}h ${Math.floor((secs % 3600) / 60)}m`.replace(/ 0m/, '');
          })()
        : 'None';

      // Topic (text/announcement channels)
      const topic = item.topic ? item.topic.slice(0, 200) + (item.topic.length > 200 ? '…' : '') : null;

      // Voice-specific
      const bitrate     = item.bitrate ? `${Math.floor(item.bitrate / 1000)} kbps` : null;
      const userLimit   = item.userLimit ? `${item.userLimit} users` : (item.userLimit === 0 ? 'Unlimited' : null);
      const videoQuality = item.videoQualityMode
        ? (item.videoQualityMode === 1 ? 'Auto' : '720p')
        : null;

      // Forum/thread specific
      const defaultArchive = item.defaultAutoArchiveDuration
        ? (() => {
            const m = item.defaultAutoArchiveDuration;
            if (m < 60)  return `${m} minutes`;
            if (m < 1440) return `${m / 60} hours`;
            return `${m / 1440} days`;
          })()
        : null;

      const threadCount = item.threads?.cache?.size;

      const lines = [
        `${emojis.whiteArrow} **__Channel Info__**`,
        `**Name:** #${item.name}`,
        `**Mention:** <#${item.id}>`,
        `**ID:** \`${item.id}\``,
        `**Type:** ${channelTypeFull(item.type)}`,
        `**Category:** ${parentName}`,
        `**Position:** ${item.rawPosition ?? 'N/A'}`,
        `**NSFW:** ${item.nsfw ? 'Yes' : 'No'}`,
        `**Slowmode:** ${slowmode}`,
        topic ? `**Topic:** ${topic}` : null,
        bitrate    ? `**Bitrate:** ${bitrate}`       : null,
        userLimit  ? `**User Limit:** ${userLimit}`  : null,
        videoQuality ? `**Video Quality:** ${videoQuality}` : null,
        defaultArchive ? `**Default Archive:** ${defaultArchive}` : null,
        threadCount !== undefined ? `**Cached Threads:** ${threadCount}` : null,
        `**Created:** ${ts(item.createdTimestamp)}`,
      ].filter(Boolean).join('\n');

      container.addTextDisplayComponents(new TextDisplayBuilder().setContent(lines));
      break;
    }

    // ── Invite ────────────────────────────────────────────────────────────────
    case 'invites': {
      const inviterName   = item.inviter
        ? `${item.inviter.globalName ?? item.inviter.username ?? 'Unknown'} (\`${item.inviter.id}\`)`
        : 'Deleted User';
      const channelStr    = item.channel?.id ? `<#${item.channel.id}>` : 'Unknown';
      const usesStr       = item.maxUses > 0 ? `${item.uses} / ${item.maxUses}` : `${item.uses} (unlimited)`;
      const maxAgeStr     = item.maxAge === 0
        ? 'Never expires'
        : (() => {
            const s = item.maxAge;
            if (s < 3600)    return `${Math.floor(s / 60)} minute${Math.floor(s / 60) !== 1 ? 's' : ''}`;
            if (s < 86_400)  return `${Math.floor(s / 3600)} hour${Math.floor(s / 3600) !== 1 ? 's' : ''}`;
            return `${Math.floor(s / 86_400)} day${Math.floor(s / 86_400) !== 1 ? 's' : ''}`;
          })();
      const expiresStr    = item.expiresTimestamp
        ? ts(item.expiresTimestamp)
        : 'Never';
      const createdStr    = item.createdTimestamp ? ts(item.createdTimestamp) : 'Unknown';

      const infoLines = [
        `${emojis.whiteArrow} **__Invite Info__**`,
        `**Code:** \`discord.gg/${item.code}\``,
        `**URL:** ${item.url}`,
        `**Created by:** ${inviterName}`,
        `**Target Channel:** ${channelStr}`,
        '',
        `${emojis.whiteArrow} **__Usage & Expiry__**`,
        `**Uses:** ${usesStr}`,
        `**Lifetime:** ${maxAgeStr}`,
        `**Temporary Membership:** ${item.temporary ? 'Yes — member is kicked if no role assigned' : 'No'}`,
        `**Created:** ${createdStr}`,
        `**Expires:** ${expiresStr}`,
      ].join('\n');

      container.addTextDisplayComponents(new TextDisplayBuilder().setContent(infoLines));
      container.addSeparatorComponents(new SeparatorBuilder().setDivider(false));
      container.addActionRowComponents(
        new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setURL(item.url)
            .setLabel('Open Invite Link')
            .setStyle(ButtonStyle.Link),
        ),
      );
      break;
    }

    // ── Ban ───────────────────────────────────────────────────────────────────
    case 'bans': {
      const user = item.user;
      const avatarUrl = user?.displayAvatarURL?.({ size: 256 }) ?? null;

      const infoLines = [
        `${emojis.whiteArrow} **__Ban Info__**`,
        `**User:** ${user?.globalName ?? user?.username ?? 'Unknown'}`,
        `**Username:** \`${user?.username ?? 'Unknown'}\``,
        `**User ID:** \`${user?.id ?? 'Unknown'}\``,
        `**Account Created:** ${user?.createdTimestamp ? ts(user.createdTimestamp) : 'Unknown'}`,
        '',
        `${emojis.whiteArrow} **__Ban Details__**`,
        `**Reason:** ${item.reason ?? 'No reason provided'}`,
      ].join('\n');

      if (avatarUrl) {
        container.addSectionComponents(
          new SectionBuilder()
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(infoLines))
            .setThumbnailAccessory(new ThumbnailBuilder().setURL(avatarUrl)),
        );
      } else {
        container.addTextDisplayComponents(new TextDisplayBuilder().setContent(infoLines));
      }
      break;
    }
  }

  container
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
    .addActionRowComponents(
      new ActionRowBuilder<ButtonBuilder>().addComponents(backBtn),
    )
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent('-# Use ← Back to List to return to the paginated list.'),
    );

  return { components: [container], flags: MessageFlags.IsComponentsV2, allowedMentions: { parse: [] } };
}

// ─────────────────────────────────────────────────────────────────────────────
// Interaction handlers
// ─────────────────────────────────────────────────────────────────────────────

function resolveListSession(interaction: any): { session: ListSession; messageId: string } | null {
  const messageId: string = interaction.message?.id ?? '';
  const session = listSessions.get(messageId);
  if (!session) return null;
  return { session, messageId };
}

export async function handleListSelect(interaction: any): Promise<void> {
  const resolved = resolveListSession(interaction);
  if (!resolved) {
    await interaction.reply({ content: 'This session has expired. Run the command again.', flags: MessageFlags.Ephemeral }).catch((): null => null);
    return;
  }
  if (interaction.user.id !== resolved.session.userId) {
    await interaction.reply({ content: 'This menu belongs to someone else.', flags: MessageFlags.Ephemeral }).catch((): null => null);
    return;
  }

  const id = interaction.values[0] as string;
  resolved.session.detailId = id;
  await interaction.update(buildListPayload(resolved.session)).catch((): null => null);
  resetListTimeout(resolved.messageId);
}

export async function handleListBack(interaction: any): Promise<void> {
  const resolved = resolveListSession(interaction);
  if (!resolved) {
    await interaction.reply({ content: 'This session has expired. Run the command again.', flags: MessageFlags.Ephemeral }).catch((): null => null);
    return;
  }
  if (interaction.user.id !== resolved.session.userId) {
    await interaction.reply({ content: 'This menu belongs to someone else.', flags: MessageFlags.Ephemeral }).catch((): null => null);
    return;
  }

  resolved.session.detailId = null;
  await interaction.update(buildListPayload(resolved.session)).catch((): null => null);
  resetListTimeout(resolved.messageId);
}

export async function handleListPage(interaction: any, delta: number): Promise<void> {
  const resolved = resolveListSession(interaction);
  if (!resolved) {
    await interaction.reply({ content: 'This session has expired. Run the command again.', flags: MessageFlags.Ephemeral }).catch((): null => null);
    return;
  }
  if (interaction.user.id !== resolved.session.userId) {
    await interaction.reply({ content: 'This menu belongs to someone else.', flags: MessageFlags.Ephemeral }).catch((): null => null);
    return;
  }

  const totalPages = Math.max(1, Math.ceil(resolved.session.items.length / PAGE_SIZE));
  const newPage = Math.min(Math.max(resolved.session.page + delta, 0), totalPages - 1);
  resolved.session.page = newPage;
  resolved.session.detailId = null;
  await interaction.update(buildListPayload(resolved.session)).catch((): null => null);
  resetListTimeout(resolved.messageId);
}
