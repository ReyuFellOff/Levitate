// xoxo/events/discord/shardReconnecting.ts

import webhookLogger from '../../utils/webhookLogger.js';

export const name = 'shardReconnecting';
export const once = false;

export function execute(shardId: number): void {
  console.log(`[SHARD] Shard ${shardId} reconnecting...`);
  webhookLogger.logShard('reconnecting', shardId);
}
