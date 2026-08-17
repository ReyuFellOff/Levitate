// xoxo/events/discord/shardError.ts

import webhookLogger from '../../utils/webhookLogger.js';

export const name = 'shardError';
export const once = false;

export function execute(error: Error, shardId: number): void {
  console.error(`[SHARD] Shard ${shardId} error: ${error.message}`);
  webhookLogger.logShard('error', shardId, error);
}
