// xoxo/helpers/github.ts
//
// GitHub API access and avatar colour extraction for the social/github command.

import { createCanvas, loadImage } from '@napi-rs/canvas';

const GITHUB_API = 'https://api.github.com';
const REQUEST_HEADERS = {
  Accept: 'application/vnd.github+json',
  'User-Agent': 'Levitate Discord Bot',
  'X-GitHub-Api-Version': '2022-11-28',
};
const FALLBACK_ACCENT = 0x5865f2;

export interface GithubRepository {
  name: string;
  html_url: string;
  stargazers_count: number;
  pushed_at: string | null;
  updated_at: string;
}

export interface GithubProfile {
  login: string;
  name: string | null;
  avatar_url: string;
  html_url: string;
  bio: string | null;
  created_at: string;
  public_repos: number;
  followers: number;
  following: number;
  repositories: GithubRepository[];
  accentColor: number;
}

export class GithubError extends Error {
  constructor(
    message: string,
    public readonly code: 'invalid-username' | 'not-found' | 'rate-limited' | 'unavailable',
  ) {
    super(message);
    this.name = 'GithubError';
  }
}

function normaliseUsername(raw: string): string {
  return raw.trim().replace(/^@+/, '');
}

function assertUsername(raw: string): string {
  const username = normaliseUsername(raw);
  if (!username || username.length > 39 || !/^[A-Za-z0-9-]+$/.test(username)) {
    throw new GithubError(
      'GitHub usernames can only contain letters, numbers, and hyphens.',
      'invalid-username',
    );
  }
  return username;
}

async function githubJson<T>(path: string): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${GITHUB_API}${path}`, { headers: REQUEST_HEADERS });
  } catch {
    throw new GithubError('GitHub could not be reached right now.', 'unavailable');
  }

  if (response.status === 404) throw new GithubError('That GitHub user does not exist.', 'not-found');
  if (response.status === 403 || response.status === 429) {
    throw new GithubError('GitHub is temporarily rate-limiting lookups. Please try again later.', 'rate-limited');
  }
  if (!response.ok) throw new GithubError(`GitHub returned HTTP ${response.status}.`, 'unavailable');

  return response.json() as Promise<T>;
}

async function dominantAvatarColor(url: string): Promise<number> {
  try {
    const response = await fetch(url, { headers: REQUEST_HEADERS });
    if (!response.ok) return FALLBACK_ACCENT;

    const image = await loadImage(Buffer.from(await response.arrayBuffer()));
    const canvas = createCanvas(32, 32);
    const context = canvas.getContext('2d');
    context.drawImage(image, 0, 0, 32, 32);
    const pixels = context.getImageData(0, 0, 32, 32).data;
    const buckets = new Map<string, number>();

    for (let index = 0; index < pixels.length; index += 4) {
      const alpha = pixels[index + 3];
      if (alpha < 180) continue;

      const r = pixels[index];
      const g = pixels[index + 1];
      const b = pixels[index + 2];
      const brightness = (r + g + b) / 3;
      if (brightness < 12 || brightness > 248) continue;

      // Quantising keeps tiny anti-aliased colour changes from defeating the
      // dominant bucket while preserving the avatar's main visual colour.
      const bucket = [r, g, b].map((channel) => Math.min(255, Math.round(channel / 32) * 32)).join(',');
      buckets.set(bucket, (buckets.get(bucket) ?? 0) + 1);
    }

    const dominant = [...buckets.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
    if (!dominant) return FALLBACK_ACCENT;

    const [r, g, b] = dominant.split(',').map(Number);
    return (r << 16) | (g << 8) | b;
  } catch {
    return FALLBACK_ACCENT;
  }
}

export async function fetchGithubProfile(rawUsername: string): Promise<GithubProfile> {
  const username = assertUsername(rawUsername);
  const user = await githubJson<{
    login: string;
    name: string | null;
    avatar_url: string;
    html_url: string;
    bio: string | null;
    created_at: string;
    public_repos: number;
    followers: number;
    following: number;
  }>(`/users/${encodeURIComponent(username)}`);

  const repositorySearch = await githubJson<{ items: GithubRepository[] }>(
    `/search/repositories?q=user%3A${encodeURIComponent(username)}&sort=stars&order=desc&per_page=5`,
  );

  return {
    ...user,
    repositories: repositorySearch.items.slice(0, 5),
    accentColor: await dominantAvatarColor(user.avatar_url),
  };
}