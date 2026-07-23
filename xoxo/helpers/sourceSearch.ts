// xoxo/helpers/sourceSearch.ts
//
// Unified search helper that routes queries through Kazagumo's search API.
// Uses kazagumo.search() (the proper Kazagumo API) which internally handles
// node selection, retries, and track construction.
//
// Routing rules:
//   1. Spotify URL/URI → try direct via Kazagumo first; if LavaSrc is not
//      installed on the node, fall back to indirect Spotify Web API resolution.
//   2. Other URL or known search prefix → pass through directly.
//   3. Plain text → try config.defaultSource first, then fallback chain.

import { LoadType } from 'shoukaku';
import config from '../config.js';
import {
  isSpotifyConfigured,
  parseSpotifyEntity,
  getTrackLite,
  getAlbumName,
  getAlbumTracksLite,
  getPlaylistName,
  getPlaylistTracksLite,
  type SpotifyTrackLite,
} from './spotifyClient.js';

export const KNOWN_SOURCE_PREFIXES = [
  'ytsearch:', 'ytmsearch:', 'scsearch:', 'spsearch:',
  'dzsearch:', 'amsearch:', 'ymsearch:',
];

// Fallback sources tried in order when the primary source returns nothing.
// scsearch (SoundCloud) is most reliable from datacenter IPs like Replit.
const FALLBACK_SOURCES = ['scsearch', 'ytmsearch', 'dzsearch'];

const URL_RE = /^https?:\/\//i;

export interface UnifiedSearchResult {
  type: 'TRACK' | 'PLAYLIST' | 'SEARCH';
  tracks: any[];
  playlistName?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Core search wrapper — uses kazagumo.search() directly
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Calls kazagumo.search() and normalises the result.
 *
 * @param sourcePrefix - e.g. 'scsearch:', 'ytmsearch:' — applied as the search
 *   prefix when the query is plain text. Pass undefined for URLs (Kazagumo
 *   detects them automatically).
 */
async function kazagumoSearch(
  client: any,
  query: string,
  requester: any,
  sourcePrefix?: string,
): Promise<UnifiedSearchResult | null> {
  try {
    const options: any = { requester };
    if (sourcePrefix) options.source = sourcePrefix;

    const result = await client.kazagumo.search(query, options);
    if (!result?.tracks?.length) return null;

    return {
      type:         result.type as 'TRACK' | 'PLAYLIST' | 'SEARCH',
      tracks:       result.tracks,
      playlistName: result.playlistName,
    };
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Spotify indirect resolution (when LavaSrc is not on the node)
// ─────────────────────────────────────────────────────────────────────────────

async function resolveSpotifyIndirect(
  client: any,
  tracks: SpotifyTrackLite[],
  requester: any,
  playlistName?: string,
): Promise<UnifiedSearchResult> {
  const resolved: any[] = [];

  for (const t of tracks.slice(0, 50)) {
    const query = `${t.artist} ${t.title}`.trim();
    // Try each fallback source until we get a result
    for (const src of FALLBACK_SOURCES) {
      const r = await kazagumoSearch(client, query, requester, `${src}:`);
      if (r?.tracks?.length) {
        resolved.push(r.tracks[0]);
        break;
      }
    }
  }

  return {
    type:         tracks.length === 1 ? 'TRACK' : 'PLAYLIST',
    tracks:       resolved,
    playlistName,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

export async function unifiedSearch(
  client: any,
  query: string,
  requester: any,
): Promise<UnifiedSearchResult> {
  const defaultSource: string = config.defaultSource || 'scsearch';
  const isUrl          = URL_RE.test(query);
  const hasKnownPrefix = KNOWN_SOURCE_PREFIXES.some((p) => query.startsWith(p));

  // ── 1. Spotify URL/URI ─────────────────────────────────────────────────────
  const spotifyEntity = (isUrl || query.startsWith('spotify:'))
    ? parseSpotifyEntity(query)
    : null;

  if (spotifyEntity) {
    // Try direct (requires LavaSrc on the Lavalink node)
    const direct = await kazagumoSearch(client, query, requester);
    if (direct?.tracks?.length) return direct;

    // Fall back to Spotify Web API → plain-text search if LavaSrc is absent
    if (!isSpotifyConfigured()) return { type: 'SEARCH', tracks: [] };

    try {
      if (spotifyEntity.type === 'track') {
        const t = await getTrackLite(spotifyEntity.id);
        return t ? await resolveSpotifyIndirect(client, [t], requester) : { type: 'SEARCH', tracks: [] };
      }
      if (spotifyEntity.type === 'album') {
        const [name, tracks] = await Promise.all([
          getAlbumName(spotifyEntity.id),
          getAlbumTracksLite(spotifyEntity.id),
        ]);
        return await resolveSpotifyIndirect(client, tracks, requester, name);
      }
      if (spotifyEntity.type === 'playlist') {
        const [name, tracks] = await Promise.all([
          getPlaylistName(spotifyEntity.id),
          getPlaylistTracksLite(spotifyEntity.id),
        ]);
        return await resolveSpotifyIndirect(client, tracks, requester, name);
      }
    } catch {
      // Spotify API call failed — fall through to empty
    }

    return { type: 'SEARCH', tracks: [] };
  }

  // ── 2. Other URL or already-prefixed query ─────────────────────────────────
  if (isUrl || hasKnownPrefix) {
    const result = await kazagumoSearch(client, query, requester);
    return result ?? { type: 'SEARCH', tracks: [] };
  }

  // ── 3. Plain text — try defaultSource, then fallback chain ─────────────────
  const primary = await kazagumoSearch(client, query, requester, `${defaultSource}:`);
  if (primary) return primary;

  for (const src of FALLBACK_SOURCES) {
    if (src === defaultSource) continue;
    const r = await kazagumoSearch(client, query, requester, `${src}:`);
    if (r) return r;
  }

  return { type: 'SEARCH', tracks: [] };
}
