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
    name: 'socials',
    displayName: 'Socials',
    description: 'Look up social profiles and discover movies, shows, and repositories.',
  },
  {
    index: 3,
    name: 'moderation',
    displayName: 'Moderation',
    description: 'Moderate your server — ban, kick, mute, warn, timeout, jail, and more.',
  },
  {
    index: 4,
    name: 'channels',
    displayName: 'Channels',
    description: 'Manage channel visibility, permissions, slowmode, NSFW status, and lockdowns.',
  },
  {
    index: 5,
    name: 'security',
    displayName: 'Security',
    description: 'Protect your server from nukes and malicious actions.',
  },
  {
    index: 6,
    name: 'utility',
    displayName: 'Utility',
    description: 'Handy utility commands — roles, moderation helpers, and more.',
  },
  {
    index: 7,
    name: 'settings',
    displayName: 'Settings',
    description: 'Personal and server command settings — prefixes and access toggles.',
  },
  {
    index: 8,
    name: 'miscellaneous',
    displayName: 'Miscellaneous',
    description: 'Standalone utility commands that do not fit another category.',
  },
  {
    index: 9,
    name: 'vcControls',
    displayName: 'VC Controls',
    description: 'Voice channel management — mute, deafen, move, and disconnect members.',
  },
  {
    index: 10,
    name: 'music',
    displayName: 'Music',
    description: 'Play music, manage queues, and control the voice player.',
  },
  {
    index: 11,
    name: 'features',
    displayName: 'Features',
    description: 'Greet, birthdays, autoresponders, logging, embeds, webhooks, containers, and convenience features.',
  },
  {
    index: 12,
    name: 'data',
    displayName: 'Data',
    description: 'Save, send, and manage custom messages, embeds, and CV2 payloads.',
  },
  {
    index: 13,
    name: 'customisation',
    displayName: 'Customisation',
    description: 'Personalise the bot\'s profile — avatar, banner, bio, and display name.',
  },
  {
    index: 14,
    name: 'fun',
    displayName: 'Fun',
    description: 'Fun commands — ship, games, image macros, and more.',
  },
  {
    index: 15,
    name: 'roleplay',
    displayName: 'Roleplay',
    description: 'Anime GIF roleplay actions for you and other members.',
  },
];

/**
 * Category folder names (lowercased) whose commands are excluded from
 * the help menu entirely — not counted, not displayed, not selectable.
 * Only developer-only categories should be listed here.
 */
export const excludedCategories: string[] = ['developer', 'developerinfo'];
