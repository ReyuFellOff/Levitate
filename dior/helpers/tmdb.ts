// xoxo/helpers/tmdb.ts
//
// Small, dependency-free TMDB client used by the cinema command.
// TMDB supports either an API key (`api_key`) or an API Read Access Token
// (`Authorization: Bearer ...`). Prefer the token when both are configured.

const TMDB_API_BASE = 'https://api.themoviedb.org/3';
const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p';

export type TmdbMediaType = 'movie' | 'tv';

export interface TmdbMediaDetails {
  id: number;
  mediaType: TmdbMediaType;
  title?: string;
  name?: string;
  original_title?: string;
  original_name?: string;
  overview?: string;
  poster_path?: string | null;
  backdrop_path?: string | null;
  release_date?: string;
  first_air_date?: string;
  last_air_date?: string;
  status?: string;
  runtime?: number | null;
  episode_run_time?: number[];
  number_of_seasons?: number;
  number_of_episodes?: number;
  genres?: Array<{ id: number; name: string }>;
  vote_average?: number;
  vote_count?: number;
  popularity?: number;
  homepage?: string | null;
  tagline?: string | null;
  production_companies?: Array<{ name: string }>;
  production_countries?: Array<{ name: string }>;
  credits?: {
    cast?: Array<{ name: string; character?: string }>;
    crew?: Array<{ name: string; job?: string; department?: string }>;
  };
  videos?: {
    results?: Array<{
      key: string;
      name: string;
      site: string;
      type: string;
      official?: boolean;
    }>;
  };
  'watch/providers'?: {
    results?: Record<string, {
      link?: string;
      flatrate?: Array<{ provider_name: string }>;
      rent?: Array<{ provider_name: string }>;
      buy?: Array<{ provider_name: string }>;
    }>;
  };
  release_dates?: {
    results?: Array<{
      iso_3166_1: string;
      release_dates?: Array<{ certification?: string }>;
    }>;
  };
  content_ratings?: {
    results?: Array<{
      iso_3166_1: string;
      rating?: string;
    }>;
  };
  external_ids?: {
    imdb_id?: string | null;
  };
  imdbRating?: number | null;
  imdbVoteCount?: number | null;
  quote?: string | null;
}

export class TmdbError extends Error {
  public readonly code: 'missing-config' | 'api' | 'not-found';

  constructor(
    code: 'missing-config' | 'api' | 'not-found',
    message: string,
  ) {
    super(message);
    this.name = 'TmdbError';
    this.code = code;
  }
}

function getAuth(): { headers: HeadersInit; query: Record<string, string> } {
  const readToken = process.env.TMDB_READ_ACCESS_TOKEN?.trim();
  if (readToken) {
    return {
      headers: { Authorization: `Bearer ${readToken}` },
      query: {},
    };
  }

  const apiKey = process.env.TMDB_API_KEY?.trim();
  if (apiKey) {
    return {
      headers: {},
      query: { api_key: apiKey },
    };
  }

  throw new TmdbError(
    'missing-config',
    'TMDB is not configured. Add TMDB_READ_ACCESS_TOKEN or TMDB_API_KEY to the bot secrets.',
  );
}

async function tmdbRequest<T>(
  path: string,
  params: Record<string, string> = {},
): Promise<T> {
  const auth = getAuth();
  const search = new URLSearchParams({ ...auth.query, ...params });
  const url = `${TMDB_API_BASE}${path}?${search.toString()}`;

  let response: Response;
  try {
    response = await fetch(url, {
      headers: {
        Accept: 'application/json',
        ...auth.headers,
      },
      signal: AbortSignal.timeout(12_000),
    });
  } catch (err: unknown) {
    const detail = err instanceof Error ? err.message : String(err);
    throw new TmdbError('api', `TMDB request failed: ${detail}`);
  }

  if (!response.ok) {
    const body = await response.json().catch((): null => null) as any;
    const detail = body?.status_message ?? `HTTP ${response.status}`;
    throw new TmdbError('api', detail);
  }

  return response.json() as Promise<T>;
}

function normalizeImdbQuote(value: unknown): string | null {
  if (typeof value !== 'string') return null;

  const firstLine = value
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*\*\s*/, '').trim())
    .find(Boolean);
  if (!firstLine) return null;

  // IMDb quote entries can include the speaker and scene directions. Keep the
  // spoken line readable when presenting it below the title.
  const withoutSceneDirection = firstLine.replace(/\[[^\]]+\]\s*/g, '').trim();
  const withoutSpeaker = withoutSceneDirection.replace(/^[^:]{1,60}:\s*/, '').trim();
  return withoutSpeaker || withoutSceneDirection || null;
}

async function fetchImdbMetadata(
  imdbId: string | null | undefined,
): Promise<{
  rating: number | null;
  voteCount: number;
  quote: string | null;
} | null> {
  if (!imdbId) return null;

  try {
    const response = await fetch('https://api.graphql.imdb.com/', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Origin: 'https://www.imdb.com',
        Referer: 'https://www.imdb.com/',
        'User-Agent': 'Mozilla/5.0',
        'x-imdb-client-name': 'imdb-web',
      },
      body: JSON.stringify({
        query: `query {
          title(id: "${imdbId}") {
            ratingsSummary { aggregateRating voteCount }
            quotes(first: 5) {
              edges {
                node {
                  displayableArticle { body { plainText } }
                }
              }
            }
          }
        }`,
      }),
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) return null;

    const body = await response.json() as any;
    const summary = body?.data?.title?.ratingsSummary;
    const rating = Number(summary?.aggregateRating);
    const voteCount = Number(summary?.voteCount);
    const quote = body?.data?.title?.quotes?.edges
      ?.map((edge: any) => normalizeImdbQuote(edge?.node?.displayableArticle?.body?.plainText))
      .find((value: string | null): value is string => Boolean(value)) ?? null;

    return {
      rating: Number.isFinite(rating) ? rating : null,
      voteCount: Number.isFinite(voteCount) ? voteCount : 0,
      quote,
    };
  } catch {
    // IMDb is an optional enrichment; TMDB results should still render if it
    // is unavailable or rate-limits the request.
    return null;
  }
}

async function fetchTmdbDetails(
  mediaType: TmdbMediaType,
  id: number,
): Promise<TmdbMediaDetails> {
  const detailPath = mediaType === 'movie'
    ? `/movie/${id}`
    : `/tv/${id}`;
  const details = await tmdbRequest<TmdbMediaDetails>(detailPath, {
    language: 'en-US',
    append_to_response: mediaType === 'movie'
      ? 'credits,videos,watch/providers,release_dates,external_ids'
      : 'credits,videos,watch/providers,content_ratings,external_ids',
  });
  const imdb = await fetchImdbMetadata(details.external_ids?.imdb_id);

  return {
    ...details,
    mediaType,
    imdbRating: imdb?.rating ?? null,
    imdbVoteCount: imdb?.voteCount ?? null,
    quote: imdb?.quote ?? null,
  };
}

export async function fetchTmdbMedia(
  mediaType: TmdbMediaType,
  query: string,
): Promise<TmdbMediaDetails | null> {
  const searchPath = mediaType === 'movie' ? '/search/movie' : '/search/tv';
  const searchResult = await tmdbRequest<{ results?: Array<Record<string, any>> }>(
    searchPath,
    {
      query,
      include_adult: 'false',
      language: 'en-US',
      page: '1',
    },
  );

  const match = searchResult.results?.[0];
  if (!match?.id) return null;
  return fetchTmdbDetails(mediaType, Number(match.id));
}

/**
 * Search both movies and TV shows and use TMDB's first matching title.
 * People are intentionally ignored because `search/multi` also returns them.
 */
export async function fetchTmdbCinema(query: string): Promise<TmdbMediaDetails | null> {
  const searchResult = await tmdbRequest<{ results?: Array<Record<string, any>> }>(
    '/search/multi',
    {
      query,
      include_adult: 'false',
      language: 'en-US',
      page: '1',
    },
  );

  const match = searchResult.results?.find(
    (result) => (result.media_type === 'movie' || result.media_type === 'tv') && result.id,
  );
  if (!match) return null;

  return fetchTmdbDetails(match.media_type as TmdbMediaType, Number(match.id));
}

export function tmdbImageUrl(
  filePath: string | null | undefined,
  size: 'w342' | 'w500' | 'original' = 'w500',
): string | null {
  return filePath ? `${TMDB_IMAGE_BASE}/${size}${filePath}` : null;
}