// xoxo/events/discord/shardResume.ts

import webhookLogger from '../../utils/webhookLogger.js';

export const name = 'shardResume';
export const once = false;

export function execute(shardId: number, replayedEvents: number): void {
  console.log(`[SHARD] Shard ${shardId} resumed — replayed ${replayedEvents} event(s)`);
  webhookLogger.logShard('resume', shardId);
}
