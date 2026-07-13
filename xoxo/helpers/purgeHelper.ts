// xoxo/helpers/purgeHelper.ts
// Shared utilities for purge commands.

/**
 * Parse text search terms from args after the subcommand token.
 * Quoted terms ("hello world") are extracted individually.
 * If no quotes are present, the entire remaining string is treated as one term.
 * Maximum 10 terms returned.
 */
export function parseTextTerms(args: string[]): string[] {
  if (args.length === 0) return [];
  const joined = args.join(' ');
  const quoted = [...joined.matchAll(/"([^"]+)"/g)].map(m => m[1]);
  if (quoted.length > 0) return quoted.slice(0, 10);
  const trimmed = joined.trim();
  return trimmed ? [trimmed] : [];
}

/**
 * Fetch messages from a channel that pass the given filter.
 * Paginates until all matching messages are collected (or maxCount is reached).
 * Always excludes the command message (excludeId).
 */
export async function fetchFilteredMessages(
  channel: any,
  excludeId: string,
  filter: (msg: any) => boolean,
  maxCount: number | null,
): Promise<any[]> {
  const result: any[] = [];
  let lastId: string | undefined;

  while (true) {
    const opts: any = { limit: 100 };
    if (lastId) opts.before = lastId;

    const batch = await channel.messages.fetch(opts).catch((): null => null);
    if (!batch || batch.size === 0) break;

    for (const [, msg] of batch) {
      if (msg.id === excludeId) continue;
      if (!filter(msg)) continue;
      result.push(msg);
      if (maxCount !== null && result.length >= maxCount) return result;
    }

    lastId = batch.last()?.id;
    if (!lastId || batch.size < 100) break;
  }

  return result;
}

/**
 * Delete an array of messages.
 * Uses bulk delete (up to 100 at a time) for messages < 14 days old.
 * Falls back to individual delete for older messages.
 * Returns the count of messages that were attempted (errors are swallowed).
 */
export async function deleteFetched(messages: any[]): Promise<number> {
  if (messages.length === 0) return 0;

  const TWO_WEEKS_MS = 14 * 24 * 60 * 60 * 1000;
  const cutoff = Date.now() - TWO_WEEKS_MS;

  const recent = messages.filter(m => m.createdTimestamp > cutoff);
  const old = messages.filter(m => m.createdTimestamp <= cutoff);

  let deleted = 0;

  for (let i = 0; i < recent.length; i += 100) {
    const chunk = recent.slice(i, i + 100);
    if (chunk.length === 1) {
      const ok = await chunk[0].delete().then(() => true).catch(() => false);
      if (ok) deleted++;
      continue;
    }
    const bulkOk = await chunk[0].channel.bulkDelete(chunk, false)
      .then(() => true)
      .catch(() => false);
    if (bulkOk) {
      deleted += chunk.length;
    } else {
      for (const m of chunk) {
        const ok = await m.delete().then(() => true).catch(() => false);
        if (ok) deleted++;
      }
    }
  }

  for (const msg of old) {
    const ok = await msg.delete().then(() => true).catch(() => false);
    if (ok) deleted++;
  }

  return deleted;
}

/**
 * Fetch all messages between two message IDs (inclusive) in a channel.
 * Uses `after: startId` and paginates forward, stopping once endId is seen
 * (or once the channel is exhausted). Automatically orders the two IDs so
 * the caller doesn't need to know which one comes first chronologically.
 */
export async function fetchMessagesBetween(
  channel: any,
  idA: string,
  idB: string,
): Promise<any[]> {
  const [startId, endId] = BigInt(idA) < BigInt(idB) ? [idA, idB] : [idB, idA];

  const result: any[] = [];
  let afterId = startId;

  while (true) {
    const batch = await channel.messages.fetch({ limit: 100, after: afterId }).catch((): null => null);
    if (!batch || batch.size === 0) break;

    const sorted = [...batch.values()].sort((a: any, b: any) => a.createdTimestamp - b.createdTimestamp);

    for (const msg of sorted) {
      if (BigInt(msg.id) > BigInt(endId)) return result;
      result.push(msg);
      afterId = msg.id;
    }

    if (sorted[sorted.length - 1]?.id === afterId && batch.size < 100) break;
  }

  return result;
}

/**
 * Strip all reactions from the most recent messages in a channel that have
 * at least one reaction. Non-destructive — messages themselves are kept.
 * Returns the number of messages that had their reactions removed.
 */
export async function stripReactions(
  channel: any,
  excludeId: string,
  maxCount: number | null,
): Promise<number> {
  let stripped = 0;
  let lastId: string | undefined;

  while (true) {
    const opts: any = { limit: 100 };
    if (lastId) opts.before = lastId;

    const batch = await channel.messages.fetch(opts).catch((): null => null);
    if (!batch || batch.size === 0) break;

    for (const [, msg] of batch) {
      if (msg.id === excludeId) continue;
      if (msg.reactions?.cache?.size > 0) {
        const ok = await msg.reactions.removeAll().then(() => true).catch(() => false);
        if (ok) stripped++;
        if (maxCount !== null && stripped >= maxCount) return stripped;
      }
    }

    lastId = batch.last()?.id;
    if (!lastId || batch.size < 100) break;
  }

  return stripped;
}

/**
 * Schedule deletion of two messages after a delay (default 5 seconds).
 */
export function scheduleCleanup(msgA: any, msgB: any, delayMs = 5000): void {
  setTimeout(async () => {
    await msgA?.delete().catch((): null => null);
    await msgB?.delete().catch((): null => null);
  }, delayMs);
}

/**
 * Schedule deletion of a single message after a delay (default 5 seconds).
 */
export function scheduleSingleCleanup(msg: any, delayMs = 5000): void {
  setTimeout(async () => {
    await msg?.delete().catch((): null => null);
  }, delayMs);
}
