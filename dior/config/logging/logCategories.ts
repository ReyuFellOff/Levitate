// xoxo/config/logCategories.ts
//
// Static metadata describing every configurable log category for the
// $log / $logs / $logging command. Drives the home menu dropdown, the
// per-category config page, and which native select-menu type is used
// to pick "exceptions" for that category.

import type { LogCategoryKey } from '../../database/database.js';

export type ExceptionKind = 'channel' | 'voiceChannel' | 'role' | 'user' | 'eventType';

export interface LogCategoryInfo {
  key: LogCategoryKey;
  label: string;
  emoji: string;
  description: string;
  /** What kind of entity is picked in the "exceptions" dropdown for this category. */
  exceptionKind: ExceptionKind;
  exceptionLabel: string;
  /** Discord events (client event names) this category listens to — shown on the page. */
  events: string[];
}

export const logCategories: LogCategoryInfo[] = [
  {
    key: 'channel',
    label: 'Channel Logs',
    emoji: 'ChannelLogs',
    description: 'Channel creation, deletion, and updates (name, topic, slowmode, NSFW, category, permissions).',
    exceptionKind: 'channel',
    exceptionLabel: 'Channels excluded from channel logs',
    events: ['channelCreate', 'channelDelete', 'channelUpdate'],
  },
  {
    key: 'member',
    label: 'Member Logs',
    emoji: 'MemberLogs',
    description: 'Members joining, leaving, nickname changes, role changes, timeouts, and bans/unbans.',
    exceptionKind: 'user',
    exceptionLabel: 'Members excluded from member logs',
    events: ['guildMemberAdd', 'guildMemberRemove', 'guildMemberUpdate', 'guildBanAdd', 'guildBanRemove'],
  },
  {
    key: 'role',
    label: 'Role Logs',
    emoji: 'RoleLogs',
    description: 'Role creation, deletion, and updates (name, color, permissions, hoist, mentionable, position).',
    exceptionKind: 'role',
    exceptionLabel: 'Roles excluded from role logs',
    events: ['roleCreate', 'roleDelete', 'roleUpdate'],
  },
  {
    key: 'vc',
    label: 'Voice Logs',
    emoji: 'VoiceLogs',
    description: 'Members joining, leaving, moving, and (un)muting/(un)deafening in voice channels.',
    exceptionKind: 'voiceChannel',
    exceptionLabel: 'Voice channels excluded from voice logs',
    events: ['voiceStateUpdate'],
  },
  {
    key: 'message',
    label: 'Message Logs',
    emoji: 'MessageLogs',
    description: 'Message deletions, bulk deletions, and edits.',
    exceptionKind: 'channel',
    exceptionLabel: 'Channels excluded from message logs',
    events: ['messageDelete', 'messageDeleteBulk', 'messageUpdate'],
  },
  {
    key: 'server',
    label: 'Server Logs',
    emoji: 'ServerLogs',
    description: 'Server setting changes (name, icon, banner, boosts) and emoji/sticker changes.',
    exceptionKind: 'eventType',
    exceptionLabel: 'Event types excluded from server logs',
    events: ['guildUpdate', 'emojiCreate', 'emojiDelete', 'emojiUpdate', 'stickerCreate', 'stickerDelete', 'stickerUpdate'],
  },
  {
    key: 'modlog',
    label: 'Modlogs',
    emoji: 'ModeratorLogs',
    description: 'Manual moderation actions: ban, kick, timeout, warn, strip, nick, etc.',
    exceptionKind: 'user',
    exceptionLabel: 'Moderators excluded from modlogs',
    events: [],
  },
];

/** Event-type options for the `server` category's exceptions select (StringSelectMenu). */
export const serverLogEventTypeOptions: { value: string; label: string; description: string }[] = [
  { value: 'guildUpdate', label: 'Server Update', description: 'Name, icon, banner, boost tier, etc.' },
  { value: 'emoji', label: 'Emoji Changes', description: 'Emoji created, deleted, or renamed.' },
  { value: 'sticker', label: 'Sticker Changes', description: 'Sticker created, deleted, or updated.' },
];

export function getLogCategoryInfo(key: string): LogCategoryInfo | undefined {
  return logCategories.find((c) => c.key === key.toLowerCase());
}
