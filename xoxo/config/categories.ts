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
    name: 'security',
    displayName: 'Security',
    description: 'Protect your server from nukes and malicious actions.',
  },
  {
    index: 4,
    name: 'utility',
    displayName: 'Utility',
    description: 'Handy utility commands — roles, moderation helpers, and more.',
  },
  {
    index: 5,
    name: 'settings',
    displayName: 'Settings',
    description: 'Personal and server command settings — prefixes and access toggles.',
  },
  {
    index: 6,
    name: 'miscellaneous',
    displayName: 'Miscellaneous',
    description: 'Standalone utility commands that do not fit another category.',
  },
  {
    index: 7,
    name: 'vcControls',
    displayName: 'VC Controls',
    description: 'Voice channel management — mute, deafen, move, and disconnect members.',
  },
  {
    index: 8,
    name: 'music',
    displayName: 'Music',
    description: 'Play music, manage queues, and control the voice player.',
  },
  {
    index: 9,
    name: 'features',
    displayName: 'Features',
    description: 'Greet, birthdays, autoresponders, logging, embeds, webhooks, containers, and convenience features.',
  },
  {
    index: 10,
    name: 'data',
    displayName: 'Data',
    description: 'Save, send, and manage custom messages, embeds, and CV2 payloads.',
  },
  {
    index: 11,
    name: 'customisation',
    displayName: 'Customisation',
    description: 'Personalise the bot\'s profile — avatar, banner, bio, and display name.',
  },
  {
    index: 12,
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
