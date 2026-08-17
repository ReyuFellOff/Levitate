// xoxo/events/discord/shardReady.ts

import webhookLogger from '../../utils/webhookLogger.js';

export const name = 'shardReady';
export const once = false;

export function execute(shardId: number): void {
  console.log(`[SHARD] Shard ${shardId} ready`);
  webhookLogger.logShard('ready', shardId);
}
