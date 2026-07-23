// xoxo/helpers/playerRetry.ts
//
// Auto-recovery for stuck/errored tracks. Re-resolves the failed track on a
// different source and injects it via player.play(retry, { replaceCurrent: true }).

import { unifiedSearch } from './sourceSearch.js';
import { getSession } from './sessionQueue.js';

const RETRY_ORDER = ['dzsearch', 'ytmsearch', 'scsearch'];

export function pickRetrySource(originalSourceName?: string): string {
  const orig = (originalSourceName ?? '').toLowerCase();
  const avoid =
    orig === 'youtube' || orig === 'youtubemusic' ? 'ytmsearch'
    : orig === 'deezer'      ? 'dzsearch'
    : orig === 'soundcloud'  ? 'scsearch'
    : '';
  for (const p of RETRY_ORDER) {
    if (p !== avoid) return p;
  }
  return 'dzsearch';
}

export async function resolveAndInjectAlternate(
  client: any,
  player: any,
  originalTrack: any,
  retrySource: string,
): Promise<any | null> {
  const queryParts = [originalTrack?.author, originalTrack?.title].filter(Boolean) as string[];
  if (!queryParts.length) return null;
  const retryQuery = `${retrySource}:${queryParts.join(' ')}`.trim();

  let retryTrack: any = null;
  try {
    const result = await unifiedSearch(client, retryQuery, originalTrack.requester ?? null);
    retryTrack = result.tracks?.[0] ?? null;
  } catch (err) {
    console.warn(`[PLAYER] Auto-retry resolve failed: ${(err as Error).message}`);
    return null;
  }

  if (!retryTrack) return null;

  retryTrack._autoRetried = true;
  if (originalTrack.requester && !retryTrack.requester) {
    retryTrack.requester = originalTrack.requester;
  }

  // Inherit the original's session entry id and rewrite the entry's .track
  const originalEntryId = originalTrack._sessionEntryId;
  if (originalEntryId) {
    retryTrack._sessionEntryId = originalEntryId;
    const state = getSession(player);
    const entry = state.entries.find((e) => e.id === originalEntryId);
    if (entry) entry.track = retryTrack;
  }

  try {
    await player.play(retryTrack, { replaceCurrent: true });
  } catch {
    return null;
  }

  return retryTrack;
}
