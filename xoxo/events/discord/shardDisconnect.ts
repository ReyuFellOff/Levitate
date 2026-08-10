// xoxo/events/discord/shardDisconnect.ts

import webhookLogger from '../../utils/webhookLogger.js';

export const name = 'shardDisconnect';
export const once = false;

export function execute(event: any, shardId: number): void {
  console.warn(`[SHARD] Shard ${shardId} disconnected — code: ${event?.code ?? 'unknown'}`);
  webhookLogger.logShard('disconnect', shardId);
}
