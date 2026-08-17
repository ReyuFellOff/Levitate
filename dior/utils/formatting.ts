// xoxo/utils/formatting.ts

export function formatDuration(ms: number, showDays = false): string {
  if (!ms || ms <= 0 || !isFinite(ms)) return 'LIVE';
  const seconds = Math.floor((ms / 1000) % 60);
  const minutes = Math.floor((ms / (1000 * 60)) % 60);
  const hours   = Math.floor((ms / (1000 * 60 * 60)) % 24);
  const days    = Math.floor(ms / (1000 * 60 * 60 * 24));
  if (showDays && days > 0) {
    const parts: string[] = [];
    if (days > 0)    parts.push(`${days}d`);
    if (hours > 0)   parts.push(`${hours}h`);
    if (minutes > 0) parts.push(`${minutes}m`);
    if (parts.length === 0) parts.push(`${seconds}s`);
    return parts.join(' ');
  }
  if (hours > 0) {
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

export function truncate(str: string, maxLen = 100): string {
  if (!str || str.length <= maxLen) return str;
  return str.slice(0, maxLen - 3) + '...';
}

export function formatNumber(num: number): string {
  return num.toLocaleString();
}

export function formatBytes(bytes: number, decimals = 2): string {
  if (bytes === 0) return '0 Bytes';
  const k  = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

export function formatDate(date: Date | number | string): string {
  const d = new Date(date);
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

export function formatRelativeTime(date: Date | number | string): string {
  const now  = Date.now();
  const then = new Date(date).getTime();
  const diff = now - then;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours   = Math.floor(minutes / 60);
  const days    = Math.floor(hours / 24);
  if (days > 0)    return `${days} day${days > 1 ? 's' : ''} ago`;
  if (hours > 0)   return `${hours} hour${hours > 1 ? 's' : ''} ago`;
  if (minutes > 0) return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
  return `${seconds} second${seconds !== 1 ? 's' : ''} ago`;
}

export function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

export function escapeFormatting(text: string): string {
  return text.replace(/[\\*_~`|>#\-]/g, '\\$&');
}

/** Backwards-compatible alias of {@link escapeFormatting}. */
export function escapeMarkdown(text: string): string {
  return escapeFormatting(text);
}

/** Format full uptime seconds → "1d 2h 3m 4s" */
export function formatUptime(totalSeconds: number): string {
  const d = Math.floor(totalSeconds / 86400);
  const h = Math.floor((totalSeconds % 86400) / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = Math.floor(totalSeconds % 60);
  const parts: string[] = [];
  if (d > 0) parts.push(`${d}d`);
  if (h > 0) parts.push(`${h}h`);
  if (m > 0) parts.push(`${m}m`);
  if (parts.length === 0 || s > 0) parts.push(`${s}s`);
  return parts.join(' ');
}

export function formatShortYear(year: number): string {
  return `'${String(year).slice(-2).padStart(2, '0')}`;
}

/** Format a Date into debug "Created at" display — e.g. "Friday, 02:30:15 PM, 15 April, '26" */
export function formatCreatedAt(date: Date): string {
  const days   = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const months = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];
  const value = new Date(date);
  return `${days[value.getDay()]}, ${formatClock(value)}, ${value.getDate()} ${months[value.getMonth()]}, ${formatShortYear(value.getFullYear())}`;
}

/** User-facing clock format used throughout bot messages. */
export function formatClock(date: Date | number = new Date()): string {
  return new Date(date).toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

/**
 * Extract a thumbnail/artwork URL from a Kazagumo track.
 * Kazagumo tracks carry a built-in `.thumbnail` property; this helper falls
 * back to deriving a YouTube thumbnail from the identifier when that's absent.
 */
export function extractThumbnail(track: any): string | null {
  if (!track) return null;
  if (track.thumbnail && typeof track.thumbnail === 'string') return track.thumbnail;
  // YouTube tracks: derive maxresdefault from the video identifier
  const id = track.identifier ?? track.info?.identifier;
  if (id && (track.sourceName === 'youtube' || track.sourceName === 'youtubemusic')) {
    return `https://img.youtube.com/vi/${id}/maxresdefault.jpg`;
  }
  return null;
}

export function formatOrdinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}
