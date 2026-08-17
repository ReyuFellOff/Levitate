// xoxo/helpers/logDispatcher.ts
//
// Central fan-out for the logging system. Every logging-capable event file
// calls `dispatchLog` with the category it belongs to, the payload to send,
// and the set of "exception IDs" relevant to that specific occurrence
// (e.g. the channel ID for a message edit, the role ID for a role update,
// both channel IDs for a voice-channel move).
//
// Behaviour:
//   • If the guild has an "all" channel configured, the payload is ALWAYS
//     sent there too — exceptions never apply to the "all" channel.
//   • If the category has its own channel configured, the payload is sent
//     there UNLESS the event is suppressed by an exception.
//   • An event is suppressed only if EVERY relevant exception ID is in the
//     category's exception list. This means a voice-channel move between an
//     excepted channel and a non-excepted one still logs (per spec: "if two
//     voice channels are in a log then it will be visible").

import type { LevitateClient } from '../structures/LevitateClient.js';
import type { LogCategoryKey } from '../database/database.js';

export async function dispatchLog(
  client: LevitateClient,
  guildId: string,
  category: LogCategoryKey,
  exceptionIds: string[],
  payload: any,
): Promise<void> {
  if (!client.db) return;

  const cfg = await client.db.getLogConfig(guildId).catch((): null => null);
  if (!cfg) return;

  const catCfg = cfg[category];
  const exceptions = new Set(catCfg?.exceptions ?? []);
  const suppressed = exceptionIds.length > 0 && exceptionIds.every((id) => exceptions.has(id));

  const targetChannelIds = new Set<string>();
  if (cfg.all_channel_id && cfg.all_enabled) targetChannelIds.add(cfg.all_channel_id);
  if (catCfg?.channel_id && catCfg.enabled && !suppressed) targetChannelIds.add(catCfg.channel_id);

  if (targetChannelIds.size === 0) return;

  for (const channelId of targetChannelIds) {
    const channel = await client.channels.fetch(channelId).catch((): null => null);
    if (!channel || !('send' in channel) || typeof (channel as any).send !== 'function') continue;
    await (channel as any).send(payload).catch((): null => null);
  }
}

/**
 * Fetches the most recent matching audit-log entry (within `withinMs`) for a
 * given audit log event type and optional target ID, returning its executor.
 * Used to attribute channel/role deletions, kicks, etc. to a moderator.
 */
export async function fetchAuditLogExecutor(
  guild: any,
  type: number,
  targetId?: string | null,
  withinMs = 6000,
): Promise<any | null> {
  try {
    const logs = await guild.fetchAuditLogs({ type, limit: 5 });
    const now = Date.now();
    const entry = logs.entries.find((e: any) => {
      if (now - e.createdTimestamp > withinMs) return false;
      if (targetId && e.targetId && e.targetId !== targetId) return false;
      return true;
    });
    return entry?.executor ?? null;
  } catch {
    return null;
  }
}
