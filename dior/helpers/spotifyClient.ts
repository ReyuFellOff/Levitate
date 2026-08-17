// xoxo/helpers/spotifyClient.ts
//
// Tiny Spotify Web API wrapper using the Client Credentials flow.
// Requires SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET env vars.
// All methods are read-only public-data calls. Falls back gracefully when
// not configured.

const TOKEN_URL = 'https://accounts.spotify.com/api/token';
const API_BASE  = 'https://api.spotify.com/v1';

interface CachedToken {
  token: string;
  expiresAt: number;
}

let cached: CachedToken | null = null;

export function isSpotifyConfigured(): boolean {
  return !!(process.env['SPOTIFY_CLIENT_ID'] && process.env['SPOTIFY_CLIENT_SECRET']);
}

export type SpotifyFailureKind =
  | 'notConfigured' | 'tokenFailure' | 'unauthorized' | 'forbidden'
  | 'notFound' | 'rateLimited' | 'serverError' | 'networkError' | 'badResponse';

export type SpotifyFailure  = { ok: false; kind: SpotifyFailureKind; status?: number; message?: string };
export type SpotifySuccess<T> = { ok: true; data: T };
export type SpotifyResult<T>  = SpotifySuccess<T> | SpotifyFailure;

export function isSpotifyFailure<T>(r: SpotifyResult<T>): r is SpotifyFailure {
  return r.ok === false;
}

async function getAccessToken(): Promise<string | null> {
  if (!isSpotifyConfigured()) return null;
  if (cached && cached.expiresAt - 60_000 > Date.now()) return cached.token;

  const creds = Buffer.from(
    `${process.env['SPOTIFY_CLIENT_ID']}:${process.env['SPOTIFY_CLIENT_SECRET']}`,
  ).toString('base64');

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { Authorization: `Basic ${creds}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=client_credentials',
  }).catch((): null => null);

  if (!res || !res.ok) return null;
  const data: any = await res.json().catch((): null => null);
  if (!data?.access_token) return null;

  cached = { token: data.access_token, expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000 };
  return cached.token;
}

function statusToKind(status: number): SpotifyFailureKind {
  if (status === 401) return 'unauthorized';
  if (status === 403) return 'forbidden';
  if (status === 404) return 'notFound';
  if (status === 429) return 'rateLimited';
  if (status >= 500) return 'serverError';
  return 'badResponse';
}

async function spotifyGet<T = any>(path: string): Promise<SpotifyResult<T>> {
  if (!isSpotifyConfigured()) return { ok: false, kind: 'notConfigured' };
  const token = await getAccessToken();
  if (!token) return { ok: false, kind: 'tokenFailure' };

  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, { headers: { Authorization: `Bearer ${token}` } });
  } catch (err) {
    return { ok: false, kind: 'networkError', message: (err as Error).message };
  }

  if (!res.ok) {
    let message: string | undefined;
    try { const b: any = await res.json(); message = b?.error?.message; } catch {}
    return { ok: false, kind: statusToKind(res.status), status: res.status, message };
  }

  const data = await res.json().catch((): null => null);
  if (!data) return { ok: false, kind: 'badResponse' };
  return { ok: true, data: data as T };
}

// ── Spotify entity parsing ─────────────────────────────────────────────────

type SpotifyEntityType = 'track' | 'album' | 'playlist';
interface SpotifyEntity { type: SpotifyEntityType; id: string }

export function parseSpotifyEntity(input: string): SpotifyEntity | null {
  const urlMatch = input.match(/open\.spotify\.com\/(track|album|playlist)\/([A-Za-z0-9]+)/);
  if (urlMatch) return { type: urlMatch[1] as SpotifyEntityType, id: urlMatch[2]! };
  const uriMatch = input.match(/^spotify:(track|album|playlist):([A-Za-z0-9]+)$/);
  if (uriMatch) return { type: uriMatch[1] as SpotifyEntityType, id: uriMatch[2]! };
  return null;
}

export interface SpotifyTrackLite { title: string; artist: string; duration: number }

export async function getTrackLite(id: string): Promise<SpotifyTrackLite | null> {
  const r = await spotifyGet<any>(`/tracks/${id}`);
  if (!r.ok) return null;
  return {
    title:    r.data.name ?? 'Unknown',
    artist:   r.data.artists?.[0]?.name ?? 'Unknown',
    duration: r.data.duration_ms ?? 0,
  };
}

export async function getAlbumName(id: string): Promise<string | null> {
  const r = await spotifyGet<any>(`/albums/${id}`);
  return r.ok ? (r.data.name ?? null) : null;
}

export async function getAlbumTracksLite(id: string, max = 50): Promise<SpotifyTrackLite[]> {
  const out: SpotifyTrackLite[] = [];
  let offset = 0;
  while (out.length < max) {
    const r = await spotifyGet<any>(`/albums/${id}/tracks?limit=50&offset=${offset}`);
    if (!r.ok || !r.data?.items?.length) break;
    for (const t of r.data.items) {
      out.push({ title: t.name ?? 'Unknown', artist: t.artists?.[0]?.name ?? 'Unknown', duration: t.duration_ms ?? 0 });
      if (out.length >= max) break;
    }
    if (r.data.items.length < 50) break;
    offset += 50;
  }
  return out;
}

export async function getPlaylistName(id: string): Promise<string | null> {
  const r = await spotifyGet<any>(`/playlists/${id}?fields=name`);
  return r.ok ? (r.data.name ?? null) : null;
}

export async function getPlaylistTracksLite(id: string, max = 100): Promise<SpotifyTrackLite[]> {
  const out: SpotifyTrackLite[] = [];
  let offset = 0;
  while (out.length < max) {
    const r = await spotifyGet<any>(`/playlists/${id}/tracks?fields=items(track(name,artists,duration_ms)),next&limit=50&offset=${offset}`);
    if (!r.ok || !r.data?.items?.length) break;
    for (const item of r.data.items) {
      const t = item?.track;
      if (!t) continue;
      out.push({ title: t.name ?? 'Unknown', artist: t.artists?.[0]?.name ?? 'Unknown', duration: t.duration_ms ?? 0 });
      if (out.length >= max) break;
    }
    if (!r.data.next) break;
    offset += 50;
  }
  return out;
}
