// xoxo/config/automodModules.ts
//
// Central registry for automod module definitions and punishment labels.

export type AutomodModuleKey =
  | 'antiSpam'
  | 'antiLink'
  | 'antiInvite'
  | 'antiBadWords'
  | 'antiMassMention'
  | 'antiCaps'
  | 'antiPing';

export type AutomodPunishment = 'delete' | 'warn' | 'timeout' | 'kick' | 'ban';

export interface AutomodModuleInfo {
  key:         AutomodModuleKey;
  displayName: string;
  /** ≤100 chars — used as select-menu option description. */
  description: string;
}

export const automodModules: AutomodModuleInfo[] = [
  {
    key:         'antiSpam',
    displayName: 'Anti-Spam',
    description: 'Flags users who send too many messages in a short window.',
  },
  {
    key:         'antiLink',
    displayName: 'Anti-Link',
    description: 'Blocks all external URLs (http/https).',
  },
  {
    key:         'antiInvite',
    displayName: 'Anti-Invite',
    description: 'Blocks Discord invite links (discord.gg/…).',
  },
  {
    key:         'antiBadWords',
    displayName: 'Anti-Bad Words',
    description: 'Filters your custom blacklisted word list.',
  },
  {
    key:         'antiMassMention',
    displayName: 'Anti-Mass Mention',
    description: 'Caps how many users/roles can be mentioned per message.',
  },
  {
    key:         'antiCaps',
    displayName: 'Anti-Caps',
    description: 'Flags messages that are overwhelmingly uppercase.',
  },
  {
    key:         'antiPing',
    displayName: 'Anti-Ping',
    description: 'Blocks @everyone and @here pings from regular members.',
  },
];

export const automodPunishmentLabels: Record<AutomodPunishment, string> = {
  delete:  'Delete Message',
  warn:    'Warn (DM)',
  timeout: 'Timeout',
  kick:    'Kick',
  ban:     'Ban',
};

/** All module keys — useful for iterating. */
export const ALL_AUTOMOD_MODULE_KEYS: AutomodModuleKey[] = automodModules.map((m) => m.key);
