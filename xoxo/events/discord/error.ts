// xoxo/events/discord/error.ts

import webhookLogger from '../../utils/webhookLogger.js';

export const name = 'error';
export const once = false;

export function execute(error: Error): void {
  console.error('[ERROR]', error.message);
  webhookLogger.logError(error, 'discord client');
}
