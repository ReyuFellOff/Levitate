// xoxo/utils/trackClone.ts
//
// Clones a KazagumoTrack into a fresh, queueable instance.
//
// We rebuild the track using its raw encoded payload and copy across the
// user-facing metadata so the now-playing panel renders identically.
// We also propagate `_sessionEntryId` so the session-queue resync logic
// in trackStart can match the cloned track back to its original entry.

export interface CloneableTrack {
  track?: string;
  encoded?: string;
  title?: string;
  author?: string;
  uri?: string;
  identifier?: string;
  isStream?: boolean;
  isSeekable?: boolean;
  length?: number;
  position?: number;
  thumbnail?: string;
  sourceName?: string;
  requester?: any;
  _sessionEntryId?: string;
  [k: string]: any;
}

/**
 * Returns a shallow clone of a Kazagumo track that is safe to push back into
 * `player.queue`. Preserves the prototype chain so KazagumoPlayer.play()
 * can still call `current.setKazagumo(this.kazagumo)` on the clone.
 */
export function cloneTrack(track: CloneableTrack): CloneableTrack {
  const proto = Object.getPrototypeOf(track) ?? Object.prototype;
  const clone: CloneableTrack = Object.assign(Object.create(proto), track);

  // Reset per-play state — these get rewritten by Kazagumo/Lavalink anyway.
  delete (clone as any).position;
  delete (clone as any).playing;

  return clone;
}
