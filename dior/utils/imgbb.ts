// xoxo/utils/imgbb.ts
//
// Thin wrapper around the imgbb upload API (https://api.imgbb.com/).
// Used by the `host-image` command to host user-provided images.

const IMGBB_UPLOAD_ENDPOINT = 'https://api.imgbb.com/1/upload';

export interface ImgbbImageVariant {
  filename: string;
  name: string;
  mime: string;
  extension: string;
  url: string;
}

export interface ImgbbUploadResult {
  id: string;
  title: string;
  url_viewer: string;
  url: string;
  display_url: string;
  width: string;
  height: string;
  size: number;
  time: string;
  expiration: string;
  image: ImgbbImageVariant;
  thumb?: ImgbbImageVariant;
  medium?: ImgbbImageVariant;
  delete_url: string;
}

/**
 * Upload a base64-encoded image to imgbb.
 *
 * @param base64      base64 payload (without the data:...;base64, prefix)
 * @param name        optional filename stem (imgbb `name` parameter)
 * @param expiration  optional auto-delete TTL in seconds (60-15552000)
 */
export async function uploadToImgbb(
  base64: string,
  name?: string,
  expiration?: number,
): Promise<ImgbbUploadResult> {
  const apiKey = process.env.IMGBB_API_KEY;
  if (!apiKey) throw new Error('IMGBB_API_KEY is not configured.');

  const body = new URLSearchParams();
  body.append('key', apiKey);
  body.append('image', base64);
  if (name) body.append('name', name);
  if (expiration) body.append('expiration', String(expiration));

  const response = await fetch(IMGBB_UPLOAD_ENDPOINT, {
    method: 'POST',
    body,
  });

  let json: any;
  try {
    json = await response.json();
  } catch {
    throw new Error(`imgbb returned a non-JSON response (HTTP ${response.status}).`);
  }

  if (!response.ok || json?.success === false) {
    const message =
      json?.error?.message ||
      json?.status_txt ||
      `imgbb upload failed (HTTP ${response.status}).`;
    throw new Error(message);
  }

  return json.data as ImgbbUploadResult;
}
