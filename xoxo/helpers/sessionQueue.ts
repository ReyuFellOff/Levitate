// xoxo/helpers/sessionQueue.ts
//
// Single source of truth for the per-player "session queue" — the full
// chronological list of tracks the bot has been asked to play in the current
// listening session (since the player was created / queue was emptied).
//
//   completed tracks  +  now-playing track  +  upcoming tracks
//
// The data lives in player.data ('sessionQueue' key) so it dies with the
// player — exactly what we want, since destroying the player marks the end
// of the session.

import { randomUUID } from 'node:crypto';
import { cloneTrack, type CloneableTrack } from '../utils/trackClone.js';

// ────────────────────────────── Types ──────────────────────────────

export interface SessionEntry {
  id: string;
  track: any;
  requester: any;
  addedAt: number;
}

export interface SessionState {
  entries: SessionEntry[];
  /**
   * Index into `entries` of the currently-playing (or about-to-play) track.
   *  -1  →  no track has started yet
   *   N  →  entries[N] is currently playing
   */
  currentIndex: number;
}

const SESSION_KEY = 'sessionQueue';
const MAX_SESSION_LENGTH = 500;

// ────────────────────────────── Core access ──────────────────────────────

export function getSession(player: any): SessionState {
  let s: SessionState | undefined = player.data?.get?.(SESSION_KEY);
  if (!s) {
    s = { entries: [], currentIndex: -1 };
    player.data?.set?.(SESSION_KEY, s);
  }
  return s;
}

export function clearSession(player: any): void {
  player.data?.set?.(SESSION_KEY, { entries: [], currentIndex: -1 });
}

function tagTrack(track: any, entryId: string): void {
  if (track && typeof track === 'object') {
    track._sessionEntryId = entryId;
  }
}

function makeEntry(track: any, requester: any): SessionEntry {
  const id = randomUUID();
  tagTrack(track, id);
  return { id, track, requester, addedAt: Date.now() };
}

function trimToCap(state: SessionState): void {
  while (state.entries.length > MAX_SESSION_LENGTH) {
    state.entries.shift();
    if (state.currentIndex >= 0) state.currentIndex -= 1;
  }
}

// ────────────────────────────── Mutations ──────────────────────────────

export function addTracks(player: any, tracks: any[], requester: any): void {
  if (!tracks?.length) return;
  const state = getSession(player);
  for (const t of tracks) state.entries.push(makeEntry(t, requester));
  trimToCap(state);
}

export function insertTracks(
  player: any,
  position: number,
  tracks: any[],
  requester: any,
): void {
  if (!tracks?.length) return;
  const state = getSession(player);
  const insertAt = Math.max(state.currentIndex + 1, 0) + (position - 1);
  const entries = tracks.map((t) => makeEntry(t, requester));
  state.entries.splice(insertAt, 0, ...entries);
  trimToCap(state);
}

export function removeUpcoming(player: any, position: number): void {
  const state = getSession(player);
  const removeAt = state.currentIndex + position;
  if (removeAt >= 0 && removeAt < state.entries.length) {
    state.entries.splice(removeAt, 1);
  }
}

export function moveUpcoming(player: any, from: number, to: number): void {
  const state = getSession(player);
  const base = state.currentIndex + 1;
  const fromIdx = base + (from - 1);
  const toIdx   = base + (to - 1);
  if (
    fromIdx < 0 || fromIdx >= state.entries.length ||
    toIdx   < 0 || toIdx   >= state.entries.length
  ) return;
  const [entry] = state.entries.splice(fromIdx, 1);
  state.entries.splice(toIdx, 0, entry);
}

export function clearUpcoming(player: any): void {
  const state = getSession(player);
  if (state.currentIndex < 0) {
    state.entries = [];
  } else {
    state.entries = state.entries.slice(0, state.currentIndex + 1);
  }
}

export function shuffleUpcoming(player: any): void {
  const state = getSession(player);
  const base = state.currentIndex + 1;
  const upcoming = state.entries.slice(base);
  for (let i = upcoming.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [upcoming[i], upcoming[j]] = [upcoming[j], upcoming[i]];
  }
  state.entries = [...state.entries.slice(0, base), ...upcoming];
}

/**
 * Jumps the player to the track at the given absolute session index.
 * Clears the Kazagumo queue, re-adds tracks from the target index onward,
 * then skips the current track. The trackStart event's syncToPlayer call
 * will then update currentIndex to match.
 */
export function jumpTo(player: any, absoluteIndex: number): void {
  const state = getSession(player);
  if (absoluteIndex < 0 || absoluteIndex >= state.entries.length) return;

  // Set currentIndex one before the target — syncToPlayer in trackStart
  // will set it to the correct value when the track begins.
  state.currentIndex = absoluteIndex - 1;

  // Clear Kazagumo's upcoming queue
  while (player.queue.length > 0) player.queue.shift();

  // Clone and re-add all entries from the target index onward
  const toAdd = state.entries.slice(absoluteIndex).map((e: SessionEntry) => cloneTrack(e.track));
  for (const track of toAdd) {
    player.queue.add(track);
  }

  // Skip the current track — triggers playerEnd then playerStart for the queued track
  player.skip();
}

export function syncToPlayer(player: any): void {
  const state = getSession(player);
  const current = player.queue?.current;
  if (!current) return;

  const entryId = (current as any)._sessionEntryId;
  if (!entryId) {
    // Unknown track — append as a new session entry at the end
    const entry = makeEntry(current, current.requester ?? null);
    state.entries.push(entry);
    state.currentIndex = state.entries.length - 1;
    return;
  }

  const idx = state.entries.findIndex((e) => e.id === entryId);
  if (idx !== -1) {
    state.currentIndex = idx;
  }
}
