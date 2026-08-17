// xoxo/helpers/sourceSearch.ts
//
// Unified search helper that calls Lavalink's REST `loadtracks` directly via
// Shoukaku (node.rest.resolve), bypassing Kazagumo's built-in search() whose
// source-prefix handling has edge cases. Raw Lavalink tracks are wrapped into
// KazagumoTrack instances so the rest of the bot (queue, now-playing panel,
// etc.) keeps working unchanged.
//
// Routing rules:
//   1. Spotify URL/URI → try LavaSrc direct passthrough first.
//      Falls back to Spotify Web API → plain-text fallback chain when LavaSrc
//      Spotify resolver is absent/broken on the node.
//   2. Other URL / known search prefix → pass through directly.
//   3. Plain text → try config.defaultSource first, then walk FALLBACK_SOURCES.

import { KazagumoTrack } from 'kazagumo';
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

/** Source prefixes recognised by Lavalink + LavaSrc plugin. */
export const KNOWN_SOURCE_PREFIXES = [
  'ytsearch:',
  'ytmsearch:',
  'scsearch:',
  'spsearch:',
  'dzsearch:',
  'amsearch:',
  'jssearch:',
  'jsrec:',
  'ymsearch:',
];

/**
 * Plain-text fallback chain. Walked in order until one returns tracks.
 */
const FALLBACK_SOURCES = ['scsearch', 'ytsearch', 'dzsearch'];

const URL_RE = /^https?:\/\//i;

export interface UnifiedSearchResult {
  type: 'TRACK' | 'PLAYLIST' | 'SEARCH';
  tracks: KazagumoTrack[];
  playlistName?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Node picker — finds any CONNECTED Shoukaku node (state === 1)
// ─────────────────────────────────────────────────────────────────────────────

function pickReadyNode(client: any): any | null {
  const nodes: Iterable<any> = client.kazagumo?.shoukaku?.nodes?.values?.() ?? [];
  for (const n of nodes) {
    // Shoukaku Node state: 0 = CONNECTING, 1 = CONNECTED, 3 = DISCONNECTED
    if (n?.state === 1) return n;
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Raw Lavalink resolve — calls node.rest.resolve(identifier)
// ─────────────────────────────────────────────────────────────────────────────

async function rawResolve(node: any, query: string): Promise<any | null> {
  return node.rest.resolve(query).catch((): null => null);
}

// ─────────────────────────────────────────────────────────────────────────────
// KazagumoTrack wrapper factory
// ─────────────────────────────────────────────────────────────────────────────

function makeWrapper(client: any, requester: any) {
  return (raw: any): KazagumoTrack => {
    const t = new KazagumoTrack(raw, requester);
    t.setKazagumo(client.kazagumo);
    return t;
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Fallback search chain — walks FALLBACK_SOURCES until one returns tracks
// ─────────────────────────────────────────────────────────────────────────────

async function fallbackSearchChain(
  node: any,
  text: string,
  skip?: string,
): Promise<{ source: string; raw: any } | null> {
  for (const src of FALLBACK_SOURCES) {
    if (src === skip) continue;
    const r = await rawResolve(node, `${src}:${text}`);
    if (
      r &&
      (r.loadType === LoadType.SEARCH || r.loadType === LoadType.TRACK) &&
      ((Array.isArray(r.data) && r.data.length > 0) || (!Array.isArray(r.data) && r.data))
    ) {
      return { source: src, raw: r };
    }
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Spotify indirect resolution (when LavaSrc is absent/broken on the node)
// ─────────────────────────────────────────────────────────────────────────────

async function resolveLiteOnLavalink(node: any, lite: SpotifyTrackLite): Promise<any | null> {
  const text = `${lite.artist} ${lite.title}`.trim();
  if (!text) return null;
  const chain = await fallbackSearchChain(node, text);
  if (!chain) return null;
  if (Array.isArray(chain.raw.data)) return chain.raw.data[0] ?? null;
  return chain.raw.data ?? null;
}

async function indirectSpotifyResolve(
  client: any,
  node: any,
  url: string,
  requester: any,
): Promise<UnifiedSearchResult | null> {
  if (!isSpotifyConfigured()) return null;
  const ref = parseSpotifyEntity(url);
  if (!ref) return null;

  const wrap = makeWrapper(client, requester);

  if (ref.type === 'track') {
    const lite = await getTrackLite(ref.id);
    if (!lite) return null;
    const raw = await resolveLiteOnLavalink(node, lite);
    if (!raw) return null;
    return { type: 'TRACK', tracks: [wrap(raw)] };
  }

  if (ref.type === 'album' || ref.type === 'playlist') {
    const [name, lites] =
      ref.type === 'playlist'
        ? await Promise.all([getPlaylistName(ref.id), getPlaylistTracksLite(ref.id)])
        : await Promise.all([getAlbumName(ref.id), getAlbumTracksLite(ref.id)]);

    if (!lites.length) return null;

    const BATCH = 8;
    const tracks: KazagumoTrack[] = [];
    for (let i = 0; i < lites.length; i += BATCH) {
      const batch = lites.slice(i, i + BATCH);
      const resolved = await Promise.all(batch.map((l) => resolveLiteOnLavalink(node, l)));
      for (const raw of resolved) {
        if (raw) tracks.push(wrap(raw));
      }
    }
    if (!tracks.length) return null;
    return {
      type: 'PLAYLIST',
      playlistName: name ?? (ref.type === 'playlist' ? 'Spotify Playlist' : 'Spotify Album'),
      tracks,
    };
  }

  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

export async function unifiedSearch(
  client: any,
  rawQuery: string,
  requester: any,
): Promise<UnifiedSearchResult> {
  const query = (rawQuery ?? '').trim();
  if (!query) return { type: 'SEARCH', tracks: [] };

  const node = pickReadyNode(client);
  if (!node) {
    console.warn('[SEARCH] No connected Lavalink nodes available for search.');
    return { type: 'SEARCH', tracks: [] };
  }

  const isUrl    = URL_RE.test(query);
  const lower    = query.toLowerCase();
  const hasPrefix = KNOWN_SOURCE_PREFIXES.some((p) => lower.startsWith(p));

  const wrap = makeWrapper(client, requester);
  const isSpotifyUrl = isUrl && /open\.spotify\.com|^spotify:/i.test(query);

  // ── 1. URL or already-prefixed query: try direct passthrough ───────────────
  if (isUrl || hasPrefix) {
    const direct = await rawResolve(node, query);

    const directHasData =
      direct &&
      direct.loadType !== LoadType.EMPTY &&
      direct.loadType !== LoadType.ERROR &&
      (direct.loadType === LoadType.PLAYLIST
        ? (direct.data?.tracks?.length ?? 0) > 0
        : direct.loadType === LoadType.SEARCH
          ? (Array.isArray(direct.data) ? direct.data.length > 0 : false)
          : !!direct.data);

    if (directHasData) {
      switch (direct.loadType) {
        case LoadType.TRACK:
          return { type: 'TRACK', tracks: [wrap(direct.data)] };
        case LoadType.PLAYLIST:
          return {
            type: 'PLAYLIST',
            playlistName: direct.data?.info?.name ?? 'Unknown Playlist',
            tracks: (direct.data?.tracks ?? []).map(wrap),
          };
        case LoadType.SEARCH:
          return { type: 'SEARCH', tracks: (Array.isArray(direct.data) ? direct.data : []).map(wrap) };
      }
    }

    // Direct resolve was empty/errored. For Spotify URLs, try indirect fallback.
    if (isSpotifyUrl) {
      const indirect = await indirectSpotifyResolve(client, node, query, requester);
      if (indirect) {
        console.log(`[SEARCH] Spotify direct failed; recovered ${indirect.tracks.length} track(s) via indirect fallback`);
        return indirect;
      }
    }

    return { type: 'SEARCH', tracks: [] };
  }

  // ── 2. Plain text: try defaultSource first, then walk FALLBACK_SOURCES ──────
  const defaultSource: string = (config as any).defaultSource || 'ytsearch';
  const primary = await rawResolve(node, `${defaultSource}:${query}`);

  if (primary && primary.loadType === LoadType.SEARCH && Array.isArray(primary.data) && primary.data.length > 0) {
    return { type: 'SEARCH', tracks: primary.data.map(wrap) };
  }
  if (primary && primary.loadType === LoadType.TRACK && primary.data) {
    return { type: 'TRACK', tracks: [wrap(primary.data)] };
  }
  if (primary && primary.loadType === LoadType.PLAYLIST && (primary.data?.tracks?.length ?? 0) > 0) {
    return {
      type: 'PLAYLIST',
      playlistName: primary.data?.info?.name ?? 'Unknown Playlist',
      tracks: (primary.data?.tracks ?? []).map(wrap),
    };
  }

  // Primary returned nothing — walk the fallback chain.
  const fallback = await fallbackSearchChain(node, query, defaultSource);
  if (fallback) {
    if (Array.isArray(fallback.raw.data)) {
      return { type: 'SEARCH', tracks: fallback.raw.data.map(wrap) };
    }
    return { type: 'TRACK', tracks: [wrap(fallback.raw.data)] };
  }

  return { type: 'SEARCH', tracks: [] };
}
