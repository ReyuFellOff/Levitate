// xoxo/utils/imageUtils.ts
//
// Image utility helpers used by customisation commands (setavatar, setbanner).

/**
 * Fetch an image URL and return it as a base64 data URI.
 * Discord's REST API expects images in this format for guild member patching.
 */
export async function imageUrlToBase64(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} when fetching image`);
  const buffer = Buffer.from(await res.arrayBuffer());
  const mimeType = res.headers.get('content-type') || 'image/png';
  return `data:${mimeType};base64,${buffer.toString('base64')}`;
}

/**
 * Return true when the string looks like a valid http/https URL.
 */
export function isValidImageUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}
