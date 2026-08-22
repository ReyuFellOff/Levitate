import { config } from '../../config.js';
// xoxo/components/logging/logMessages.ts
//
// CV2 payload builders for every loggable event. Each function returns a
// ready-to-send `{ components, flags, allowedMentions }` object. Keep these
// pure/formatting-only — event files handle fetching data and dispatching.

import {
  ContainerBuilder,
  SeparatorBuilder,
  TextDisplayBuilder,
  MessageFlags,
  ChannelType,
} from 'discord.js';
import { emojis } from '../../emojis.js';

function ts(date: Date = new Date()): string {
  return `<t:${Math.floor(date.getTime() / 1000)}:F>`;
}

function build(headerEmoji: string, title: string, bodyLines: string[]): any {
  const container = new ContainerBuilder().setAccentColor(parseInt(config.defaultAccentColor.replace('#', ''), 16))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(`## ${headerEmoji} ${title}`))
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(bodyLines.join('\n')))
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(`-# ${ts()}`));

  return {
    components: [container],
    flags: MessageFlags.IsComponentsV2,
    allowedMentions: { parse: [] },
  };
}

function bullet(label: string, value: string): string {
  return `${emojis.glowyWhiteArrow} **${label}:** ${value}`;
}

function truncate(text: string, max = 950): string {
  if (!text) return '*empty*';
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

function channelTypeName(type: number): string {
  switch (type) {
    case ChannelType.GuildText:          return 'Text';
    case ChannelType.DM:                 return 'DM';
    case ChannelType.GuildVoice:         return 'Voice';
    case ChannelType.GroupDM:            return 'Group DM';
    case ChannelType.GuildCategory:      return 'Category';
    case ChannelType.GuildAnnouncement:  return 'Announcement';
    case ChannelType.AnnouncementThread: return 'Announcement Thread';
    case ChannelType.PublicThread:       return 'Public Thread';
    case ChannelType.PrivateThread:      return 'Private Thread';
    case ChannelType.GuildStageVoice:    return 'Stage';
    case ChannelType.GuildDirectory:     return 'Directory';
    case ChannelType.GuildForum:         return 'Forum';
    case ChannelType.GuildMedia:         return 'Media';
    default:                             return `Unknown (${type})`;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Channel logs
// ─────────────────────────────────────────────────────────────────────────────

export function buildChannelCreatePayload(channel: any, executor: any | null): any {
  return build(emojis.greentick, 'Channel Created', [
    bullet('Name', `${channel.name} (\`${channel.id}\`)`),
    bullet('Type', channelTypeName(channel.type)),
    bullet('Category', channel.parent?.name ?? '*None*'),
    bullet('Created by', executor ? `${executor.tag ?? executor.username} (\`${executor.id}\`)` : '*Unknown*'),
  ]);
}

export function buildChannelDeletePayload(channel: any, executor: any | null): any {
  return build(emojis.redcross, 'Channel Deleted', [
    bullet('Name', `${channel.name} (\`${channel.id}\`)`),
    bullet('Type', channelTypeName(channel.type)),
    bullet('Category', channel.parent?.name ?? '*None*'),
    bullet('Deleted by', executor ? `${executor.tag ?? executor.username} (\`${executor.id}\`)` : '*Unknown*'),
  ]);
}

export function buildChannelUpdatePayload(
  channel: any,
  changes: { field: string; before: string; after: string }[],
  executor: any | null,
): any {
  const lines = changes.map((c) => `${emojis.glowyWhiteArrow} **${c.field}:** ${c.before} → ${c.after}`);
  return build(emojis.info, `Channel Updated — ${channel.name}`, [
    bullet('Channel', `<#${channel.id}> (\`${channel.id}\`)`),
    ...lines,
    bullet('Updated by', executor ? `${executor.tag ?? executor.username} (\`${executor.id}\`)` : '*Unknown*'),
  ]);
}

// ─────────────────────────────────────────────────────────────────────────────
// Role logs
// ─────────────────────────────────────────────────────────────────────────────

export function buildRoleCreatePayload(role: any, executor: any | null): any {
  return build(emojis.greentick, 'Role Created', [
    bullet('Name', `${role.name} (\`${role.id}\`)`),
    bullet('Color', role.hexColor ?? '#000000'),
    bullet('Hoisted', role.hoist ? 'Yes' : 'No'),
    bullet('Mentionable', role.mentionable ? 'Yes' : 'No'),
    bullet('Created by', executor ? `${executor.tag ?? executor.username} (\`${executor.id}\`)` : '*Unknown*'),
  ]);
}

export function buildRoleDeletePayload(role: any, executor: any | null): any {
  return build(emojis.redcross, 'Role Deleted', [
    bullet('Name', `${role.name} (\`${role.id}\`)`),
    bullet('Color', role.hexColor ?? '#000000'),
    bullet('Deleted by', executor ? `${executor.tag ?? executor.username} (\`${executor.id}\`)` : '*Unknown*'),
  ]);
}

export function buildRoleUpdatePayload(
  role: any,
  changes: { field: string; before: string; after: string }[],
  executor: any | null,
): any {
  const lines = changes.map((c) => `${emojis.glowyWhiteArrow} **${c.field}:** ${c.before} → ${c.after}`);
  return build(emojis.info, `Role Updated — ${role.name}`, [
    bullet('Role', `<@&${role.id}> (\`${role.id}\`)`),
    ...lines,
    bullet('Updated by', executor ? `${executor.tag ?? executor.username} (\`${executor.id}\`)` : '*Unknown*'),
  ]);
}

/**
 * Emitted once after a burst of position-only role updates settles (600 ms
 * debounce). Replaces the flood of individual "Position changed" entries that
 * Discord fires when any reorder or role assignment shifts other roles.
 */
export function buildRolesReorderedPayload(executor: any | null): any {
  return build(emojis.info, 'Roles Reordered', [
    bullet('Reordered by', executor ? `${executor.tag ?? executor.username} (\`${executor.id}\`)` : '*Unknown*'),
  ]);
}

// ─────────────────────────────────────────────────────────────────────────────
// Member logs
// ─────────────────────────────────────────────────────────────────────────────

export function buildMemberJoinPayload(member: any): any {
  const accountAgeSec = Math.floor(member.user.createdTimestamp / 1000);
  return build(emojis.greentick, 'Member Joined', [
    bullet('User', `<@${member.id}> (\`${member.id}\`)`),
    bullet('Account created', `<t:${accountAgeSec}:R>`),
    bullet('Member count', `${member.guild.memberCount}`),
  ]);
}

export function buildMemberLeavePayload(member: any): any {
  const joinedSec = member.joinedTimestamp ? Math.floor(member.joinedTimestamp / 1000) : null;
  const roleNames = member.roles?.cache
    ? [...member.roles.cache.values()].filter((r: any) => r.id !== member.guild.id).map((r: any) => r.name)
    : [];
  return build(emojis.redcross, 'Member Left', [
    bullet('User', `<@${member.id}> (\`${member.id}\`)`),
    bullet('Joined', joinedSec ? `<t:${joinedSec}:R>` : '*Unknown*'),
    bullet('Roles', roleNames.length ? roleNames.join(', ') : '*None*'),
    bullet('Member count', `${member.guild.memberCount}`),
  ]);
}

export function buildMemberNicknameUpdatePayload(member: any, before: string, after: string): any {
  return build(emojis.info, 'Nickname Updated', [
    bullet('User', `<@${member.id}> (\`${member.id}\`)`),
    bullet('Before', before || '*None*'),
    bullet('After', after || '*None*'),
  ]);
}

export function buildMemberRolesUpdatePayload(
  member: any,
  added: any[],
  removed: any[],
  executor: any | null,
): any {
  const lines: string[] = [bullet('User', `<@${member.id}> (\`${member.id}\`)`)];
  if (added.length) lines.push(bullet('Roles added', added.map((r) => `<@&${r.id}>`).join(', ')));
  if (removed.length) lines.push(bullet('Roles removed', removed.map((r) => `<@&${r.id}>`).join(', ')));
  lines.push(bullet('Changed by', executor ? `${executor.tag ?? executor.username} (\`${executor.id}\`)` : '*Unknown*'));
  return build(emojis.info, 'Member Roles Updated', lines);
}

export function buildMemberTimeoutSetPayload(member: any, until: Date, reason: string, executor: any | null): any {
  return build(emojis.clock, 'Member Timed Out', [
    bullet('User', `<@${member.id}> (\`${member.id}\`)`),
    bullet('Until', `<t:${Math.floor(until.getTime() / 1000)}:F>`),
    bullet('Reason', reason || 'None provided.'),
    bullet('Moderator', executor ? `${executor.tag ?? executor.username} (\`${executor.id}\`)` : '*Unknown*'),
  ]);
}

export function buildMemberTimeoutRemovedPayload(member: any, executor: any | null): any {
  return build(emojis.clock, 'Member Timeout Removed', [
    bullet('User', `<@${member.id}> (\`${member.id}\`)`),
    bullet('Moderator', executor ? `${executor.tag ?? executor.username} (\`${executor.id}\`)` : '*Unknown*'),
  ]);
}

export function buildMemberBanPayload(user: any, reason: string, executor: any | null): any {
  return build(emojis.redcross, 'Member Banned', [
    bullet('User', `<@${user.id}> (\`${user.id}\`)`),
    bullet('Reason', reason || 'None provided.'),
    bullet('Moderator', executor ? `${executor.tag ?? executor.username} (\`${executor.id}\`)` : '*Unknown*'),
  ]);
}

export function buildMemberUnbanPayload(user: any, executor: any | null): any {
  return build(emojis.greentick, 'Member Unbanned', [
    bullet('User', `<@${user.id}> (\`${user.id}\`)`),
    bullet('Moderator', executor ? `${executor.tag ?? executor.username} (\`${executor.id}\`)` : '*Unknown*'),
  ]);
}

// ─────────────────────────────────────────────────────────────────────────────
// Voice logs
// ─────────────────────────────────────────────────────────────────────────────

export function buildVoiceJoinPayload(member: any, channel: any): any {
  return build(emojis.greentick, 'Voice Channel Joined', [
    bullet('User', `<@${member.id}> (\`${member.id}\`)`),
    bullet('Channel', `<#${channel.id}> (\`${channel.id}\`)`),
  ]);
}

export function buildVoiceLeavePayload(member: any, channel: any): any {
  return build(emojis.redcross, 'Voice Channel Left', [
    bullet('User', `<@${member.id}> (\`${member.id}\`)`),
    bullet('Channel', `<#${channel.id}> (\`${channel.id}\`)`),
  ]);
}

export function buildVoiceMovePayload(member: any, from: any, to: any): any {
  return build(emojis.info, 'Voice Channel Moved', [
    bullet('User', `<@${member.id}> (\`${member.id}\`)`),
    bullet('From', `<#${from.id}>`),
    bullet('To', `<#${to.id}>`),
  ]);
}

export function buildVoiceStateFlagPayload(
  member: any,
  channel: any,
  label: string,
  value: boolean,
): any {
  return build(emojis.info, `Voice: ${label}`, [
    bullet('User', `<@${member.id}> (\`${member.id}\`)`),
    bullet('Channel', `<#${channel.id}>`),
    bullet('State', value ? 'Enabled' : 'Disabled'),
  ]);
}

// ─────────────────────────────────────────────────────────────────────────────
// Message logs
// ─────────────────────────────────────────────────────────────────────────────

export function buildMessageDeletePayload(message: any): any {
  const author = message.author;
  return build(emojis.redcross, 'Message Deleted', [
    bullet('Author', author ? `<@${author.id}> (\`${author.id}\`)` : '*Unknown*'),
    bullet('Channel', `<#${message.channelId ?? message.channel?.id}>`),
    bullet('Content', truncate(message.content ?? '')),
  ]);
}

export function buildMessageBulkDeletePayload(channel: any, count: number): any {
  return build(emojis.redcross, 'Messages Bulk Deleted', [
    bullet('Channel', `<#${channel.id}>`),
    bullet('Count', `${count} message${count === 1 ? '' : 's'}`),
  ]);
}

export function buildMessageUpdatePayload(oldMessage: any, newMessage: any): any {
  const author = newMessage.author ?? oldMessage.author;
  return build(emojis.info, 'Message Edited', [
    bullet('Author', author ? `<@${author.id}> (\`${author.id}\`)` : '*Unknown*'),
    bullet('Channel', `<#${newMessage.channelId ?? newMessage.channel?.id}>`),
    bullet('Before', truncate(oldMessage.content ?? '')),
    bullet('After', truncate(newMessage.content ?? '')),
    bullet('Jump', `[Click here](${newMessage.url})`),
  ]);
}

// ─────────────────────────────────────────────────────────────────────────────
// Server logs
// ─────────────────────────────────────────────────────────────────────────────

export function buildGuildUpdatePayload(
  guild: any,
  changes: { field: string; before: string; after: string }[],
): any {
  const lines = changes.map((c) => `${emojis.glowyWhiteArrow} **${c.field}:** ${c.before} → ${c.after}`);
  return build(emojis.info, `Server Updated — ${guild.name}`, lines);
}

export function buildEmojiCreatePayload(emoji: any): any {
  return build(emojis.greentick, 'Emoji Created', [
    bullet('Name', `:${emoji.name}:`),
    bullet('ID', `\`${emoji.id}\``),
    bullet('Animated', emoji.animated ? 'Yes' : 'No'),
  ]);
}

export function buildEmojiDeletePayload(emoji: any): any {
  return build(emojis.redcross, 'Emoji Deleted', [
    bullet('Name', `:${emoji.name}:`),
    bullet('ID', `\`${emoji.id}\``),
  ]);
}

export function buildEmojiUpdatePayload(before: any, after: any): any {
  return build(emojis.info, 'Emoji Renamed', [
    bullet('Before', `:${before.name}:`),
    bullet('After', `:${after.name}:`),
    bullet('ID', `\`${after.id}\``),
  ]);
}

export function buildStickerCreatePayload(sticker: any): any {
  return build(emojis.greentick, 'Sticker Created', [
    bullet('Name', sticker.name),
    bullet('ID', `\`${sticker.id}\``),
  ]);
}

export function buildStickerDeletePayload(sticker: any): any {
  return build(emojis.redcross, 'Sticker Deleted', [
    bullet('Name', sticker.name),
    bullet('ID', `\`${sticker.id}\``),
  ]);
}

export function buildStickerUpdatePayload(before: any, after: any): any {
  return build(emojis.info, 'Sticker Updated', [
    bullet('Name', `${before.name} → ${after.name}`),
    bullet('ID', `\`${after.id}\``),
  ]);
}
