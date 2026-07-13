// xoxo/config/categories.ts
import { botName } from '../config.js';

export interface CategoryInfo {
  index: number;
  name: string;
  displayName: string;
  description: string;
}

export const categories: CategoryInfo[] = [
  {
    index: 1,
    name: 'info',
    displayName: 'Info',
    description: `Get information about ${botName} and its commands.`,
  },
  {
    index: 2,
    name: 'moderation',
    displayName: 'Moderation',
    description: 'Moderate your server — ban, kick, mute, warn, timeout, and more.',
  },
  {
    index: 3,
    name: 'antinuke',
    displayName: 'Antinuke',
    description: 'Protect your server from nukes and malicious actions.',
  },
  {
    index: 4,
    name: 'purge',
    displayName: 'Purge',
    description: 'Bulk-delete messages, purge by filter, snipe deleted messages, and more.',
  },
  {
    index: 5,
    name: 'utility',
    displayName: 'Utility',
    description: 'Handy utility commands — embeds, webhooks, roles, AFK, and more.',
  },
  {
    index: 6,
    name: 'server',
    displayName: 'Server',
    description: 'Server and user info, avatars, prefixes, and member lookup.',
  },
  {
    index: 7,
    name: 'vcControls',
    displayName: 'VC Controls',
    description: 'Voice channel management — mute, deafen, move, and disconnect members.',
  },
  {
    index: 8,
    name: 'welcomer',
    displayName: 'Welcomer',
    description: 'Welcome new members and celebrate birthdays automatically.',
  },
  {
    index: 9,
    name: 'logging',
    displayName: 'Logging',
    description: 'Configure logging for channels, members, roles, voice, messages, and server changes.',
  },
  {
    index: 10,
    name: 'autoresponder',
    displayName: 'Autoresponder',
    description: 'Automatically react or reply when specific words are said.',
  },
  {
    index: 11,
    name: 'data',
    displayName: 'Data',
    description: 'Save, send, and manage custom messages, embeds, and CV2 payloads.',
  },
  {
    index: 12,
    name: 'customisation',
    displayName: 'Customisation',
    description: 'Personalise the bot\'s profile — avatar, banner, bio, and display name.',
  },
  {
    index: 13,
    name: 'fun',
    displayName: 'Fun',
    description: 'Fun commands — ship, games, image macros, and more.',
  },
];

/**
 * Category folder names (lowercased) whose commands are excluded from
 * the help menu entirely — not counted, not displayed, not selectable.
 * Only developer-only categories should be listed here.
 */
export const excludedCategories: string[] = ['developer', 'developerinfo'];
