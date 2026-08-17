// xoxo/utils/modlogHelper.ts
//
// Dispatches a modlog entry to the guild's configured modlog channel.
// The modlog channel is stored in the standard log_configs system under the
// `modlog` category, so it can be configured with `$log modlog <#channel>`.
// Always fire-and-forget — never throws, never blocks a moderation action.

import type { LevitateClient } from '../structures/LevitateClient.js';

/**
 * Send a CV2 payload to the guild's modlog channel.
 * Safe to call without `await` — errors are silently swallowed.
 */
export async function sendModLog(
  client:  LevitateClient,
  guildId: string,
  payload: any,
): Promise<void> {
  try {
    if (!client.db) return;

    const cfg = await client.db.getLogConfig(guildId).catch((): null => null);
    if (!cfg?.modlog?.enabled) return;

    const channelId = cfg.modlog.channel_id ?? (cfg.all_enabled ? cfg.all_channel_id : null);
    if (!channelId) return;

    const channel = (client.channels.cache.get(channelId) as any)
      ?? await client.channels.fetch(channelId).catch((): null => null);

    if (!channel?.isTextBased?.()) return;
    await channel.send(payload);
  } catch {
    // Modlog errors must never surface to the user or break a mod action.
  }
}
