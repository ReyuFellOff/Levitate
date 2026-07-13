// xoxo/config/antinukeModules.ts
//
// Central registry describing every antinuke module: display metadata,
// which punishments are valid for it, and whether it is threshold-based
// (N actions within a rolling window) or fires immediately on a single
// dangerous action.
//
// Also contains the pre-made profile definitions used by `$antinuke profile`.

import type { AntinukeModuleKey, AntinukePunishment } from '../database/database.js';

export interface AntinukeModuleInfo {
  key:          AntinukeModuleKey;
  displayName:  string;
  description:  string;
  /** If true, the module trips after `limit` matching events within the tracking window. If false, it always fires on the first offending action. */
  thresholdBased: boolean;
  /** Punishments this module supports (a subset of the full AntinukePunishment union). */
  allowedPunishments: AntinukePunishment[];
  /** What kind of thing gets reverted, if anything, when this module trips. Purely descriptive. */
  revertBehaviour: string;
}

export const antinukeModules: AntinukeModuleInfo[] = [
  {
    key: 'channelCreate',
    displayName: 'Channel Create',
    description: 'Detects rapid, mass creation of channels — a common precursor to a server nuke.',
    thresholdBased: true,
    allowedPunishments: ['ban', 'kick', 'strip', 'quarantine', 'none'],
    revertBehaviour: 'Deletes every channel created by the offender during the triggering burst.',
  },
  {
    key: 'channelDelete',
    displayName: 'Channel Delete',
    description: 'Detects rapid, mass deletion of channels.',
    thresholdBased: true,
    allowedPunishments: ['ban', 'kick', 'strip', 'quarantine', 'none'],
    revertBehaviour: 'Recreates every deleted channel with its original name, type, and position.',
  },
  {
    key: 'roleCreate',
    displayName: 'Role Create',
    description: 'Detects rapid, mass creation of roles.',
    thresholdBased: true,
    allowedPunishments: ['ban', 'kick', 'strip', 'quarantine', 'none'],
    revertBehaviour: 'Deletes every role created by the offender during the triggering burst.',
  },
  {
    key: 'roleDelete',
    displayName: 'Role Delete',
    description: 'Detects rapid, mass deletion of roles.',
    thresholdBased: true,
    allowedPunishments: ['ban', 'kick', 'strip', 'quarantine', 'none'],
    revertBehaviour: 'Recreates every deleted role with its original name, color, and permissions.',
  },
  {
    key: 'roleUpdate',
    displayName: 'Dangerous Permission Grant',
    description: 'Detects a role being given Administrator or another dangerous permission (Manage Server, Manage Roles, Manage Channels, Ban Members, Kick Members, Mention Everyone), or a dangerous role being handed to a member.',
    thresholdBased: true,
    allowedPunishments: ['ban', 'kick', 'strip', 'quarantine', 'none'],
    revertBehaviour: 'Strips the newly granted dangerous permissions back off the role.',
  },
  {
    key: 'banAdd',
    displayName: 'Mass Ban',
    description: 'Detects a burst of members being banned in a short window.',
    thresholdBased: true,
    allowedPunishments: ['ban', 'kick', 'strip', 'quarantine', 'none'],
    revertBehaviour: 'Unbans every member banned by the offender during the triggering burst.',
  },
  {
    key: 'kick',
    displayName: 'Mass Kick',
    description: 'Detects a burst of members being kicked in a short window.',
    thresholdBased: true,
    allowedPunishments: ['ban', 'kick', 'strip', 'quarantine', 'none'],
    revertBehaviour: 'None — Discord does not allow kicked members to be restored automatically.',
  },
  {
    key: 'webhookCreate',
    displayName: 'Webhook Create',
    description: 'Detects a burst of new webhooks being created — often used to spam or impersonate.',
    thresholdBased: true,
    allowedPunishments: ['ban', 'kick', 'strip', 'quarantine', 'none'],
    revertBehaviour: 'Deletes every webhook created by the offender during the triggering burst.',
  },
  {
    key: 'botAdd',
    displayName: 'Unauthorized Bot Add',
    description: 'Detects any bot joining the server through an OAuth invite that is not on the whitelist.',
    thresholdBased: false,
    allowedPunishments: ['ban', 'kick', 'none'],
    revertBehaviour: 'None — the punishment (kick/ban) itself removes the bot.',
  },
  {
    key: 'emojiDelete',
    displayName: 'Mass Emoji Delete',
    description: 'Detects a burst of custom emoji being deleted.',
    thresholdBased: true,
    allowedPunishments: ['ban', 'kick', 'strip', 'quarantine', 'none'],
    revertBehaviour: 'None — the emoji image data is gone once deleted and cannot be restored.',
  },
  {
    key: 'guildUpdate',
    displayName: 'Server Identity Change',
    description: 'Detects the server name, icon, or vanity URL being changed.',
    thresholdBased: true,
    allowedPunishments: ['ban', 'kick', 'strip', 'quarantine', 'none'],
    revertBehaviour: 'Reverts the server name/icon back to what it was before the change.',
  },
];

export const antinukeModuleKeys: AntinukeModuleKey[] = antinukeModules.map((m) => m.key);

export function getAntinukeModuleInfo(key: string): AntinukeModuleInfo | null {
  return antinukeModules.find((m) => m.key === key.trim()) ?? null;
}

export function resolveAntinukeModuleKey(input: string): AntinukeModuleKey | null {
  const lower = input.trim().toLowerCase();
  const aliases: Record<string, AntinukeModuleKey> = {
    channelcreate: 'channelCreate', chcreate: 'channelCreate', ccreate: 'channelCreate',
    channeldelete: 'channelDelete', chdelete: 'channelDelete', cdelete: 'channelDelete',
    rolecreate: 'roleCreate', rcreate: 'roleCreate',
    roledelete: 'roleDelete', rdelete: 'roleDelete',
    roleupdate: 'roleUpdate', rupdate: 'roleUpdate', perms: 'roleUpdate', permissions: 'roleUpdate', dangerousperms: 'roleUpdate',
    banadd: 'banAdd', ban: 'banAdd', massban: 'banAdd',
    kick: 'kick', masskick: 'kick',
    webhookcreate: 'webhookCreate', webhook: 'webhookCreate', webhooks: 'webhookCreate',
    botadd: 'botAdd', bot: 'botAdd', bots: 'botAdd',
    emojidelete: 'emojiDelete', emoji: 'emojiDelete', emojis: 'emojiDelete',
    guildupdate: 'guildUpdate', server: 'guildUpdate', identity: 'guildUpdate', vanity: 'guildUpdate',
  };
  if (aliases[lower]) return aliases[lower];
  const direct = antinukeModuleKeys.find((k) => k.toLowerCase() === lower);
  return direct ?? null;
}

export const antinukePunishmentLabels: Record<AntinukePunishment, string> = {
  ban: 'Ban',
  kick: 'Kick',
  strip: 'Strip Roles',
  quarantine: 'Quarantine',
  none: 'Log Only',
};

export function resolveAntinukePunishment(input: string): AntinukePunishment | null {
  const lower = input.trim().toLowerCase();
  const map: Record<string, AntinukePunishment> = {
    ban: 'ban',
    kick: 'kick',
    strip: 'strip', striproles: 'strip', stripallroles: 'strip',
    quarantine: 'quarantine', jail: 'quarantine',
    none: 'none', log: 'none', 'log-only': 'none', logonly: 'none',
  };
  return map[lower] ?? null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Pre-made profiles
// ─────────────────────────────────────────────────────────────────────────────

export interface AntinukeProfile {
  id: string;
  displayName: string;
  description: string;
  /** If true, the master antinuke switch is also enabled when this profile is applied. */
  enablesAntinuke: boolean;
  modules: Record<AntinukeModuleKey, { limit: number; punishment: AntinukePunishment }>;
}

export const antinukeProfiles: AntinukeProfile[] = [
  {
    id: 'lockdown',
    displayName: 'Lockdown',
    description: 'Emergency maximum-security mode. Every module trips on the first action and bans immediately. Enables antinuke. Use when your server is actively under attack.',
    enablesAntinuke: true,
    modules: {
      channelCreate: { limit: 1, punishment: 'ban' },
      channelDelete: { limit: 1, punishment: 'ban' },
      roleCreate:    { limit: 1, punishment: 'ban' },
      roleDelete:    { limit: 1, punishment: 'ban' },
      roleUpdate:    { limit: 1, punishment: 'ban' },
      banAdd:        { limit: 1, punishment: 'ban' },
      kick:          { limit: 1, punishment: 'ban' },
      webhookCreate: { limit: 1, punishment: 'ban' },
      botAdd:        { limit: 1, punishment: 'ban' },
      emojiDelete:   { limit: 1, punishment: 'ban' },
      guildUpdate:   { limit: 1, punishment: 'ban' },
    },
  },
  {
    id: 'strict',
    displayName: 'Strict',
    description: 'High protection. Bans on all destructive actions, low thresholds. Ideal for active servers with a history of raid attempts.',
    enablesAntinuke: true,
    modules: {
      channelCreate: { limit: 2, punishment: 'ban' },
      channelDelete: { limit: 1, punishment: 'ban' },
      roleCreate:    { limit: 2, punishment: 'ban' },
      roleDelete:    { limit: 1, punishment: 'ban' },
      roleUpdate:    { limit: 1, punishment: 'ban' },
      banAdd:        { limit: 1, punishment: 'ban' },
      kick:          { limit: 2, punishment: 'ban' },
      webhookCreate: { limit: 1, punishment: 'ban' },
      botAdd:        { limit: 1, punishment: 'ban' },
      emojiDelete:   { limit: 2, punishment: 'ban' },
      guildUpdate:   { limit: 1, punishment: 'ban' },
    },
  },
  {
    id: 'balanced',
    displayName: 'Balanced',
    description: 'Sensible defaults for most servers. Bans for destructive actions, kicks for creates. A good starting point that you can tune from.',
    enablesAntinuke: true,
    modules: {
      channelCreate: { limit: 2, punishment: 'kick' },
      channelDelete: { limit: 2, punishment: 'ban' },
      roleCreate:    { limit: 2, punishment: 'kick' },
      roleDelete:    { limit: 2, punishment: 'ban' },
      roleUpdate:    { limit: 1, punishment: 'ban' },
      banAdd:        { limit: 2, punishment: 'ban' },
      kick:          { limit: 3, punishment: 'ban' },
      webhookCreate: { limit: 2, punishment: 'kick' },
      botAdd:        { limit: 1, punishment: 'kick' },
      emojiDelete:   { limit: 3, punishment: 'kick' },
      guildUpdate:   { limit: 1, punishment: 'ban' },
    },
  },
  {
    id: 'lenient',
    displayName: 'Lenient',
    description: 'Relaxed thresholds with less aggressive punishments. Best for trusted communities where accidental trips are a concern.',
    enablesAntinuke: true,
    modules: {
      channelCreate: { limit: 5, punishment: 'kick' },
      channelDelete: { limit: 3, punishment: 'kick' },
      roleCreate:    { limit: 5, punishment: 'kick' },
      roleDelete:    { limit: 3, punishment: 'kick' },
      roleUpdate:    { limit: 2, punishment: 'strip' },
      banAdd:        { limit: 4, punishment: 'kick' },
      kick:          { limit: 5, punishment: 'kick' },
      webhookCreate: { limit: 4, punishment: 'kick' },
      botAdd:        { limit: 1, punishment: 'kick' },
      emojiDelete:   { limit: 5, punishment: 'kick' },
      guildUpdate:   { limit: 2, punishment: 'strip' },
    },
  },
];

export function resolveAntinukeProfile(input: string): AntinukeProfile | null {
  const lower = input.trim().toLowerCase();
  return antinukeProfiles.find((p) => p.id === lower || p.displayName.toLowerCase() === lower) ?? null;
}
