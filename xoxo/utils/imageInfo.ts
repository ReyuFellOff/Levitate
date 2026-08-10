// xoxo/utils/imageInfo.ts
//
// Zero-dependency image metadata sniffer. Reads just enough of the file
// header to determine the format and pixel dimensions of common web image
// types. Used by `host-image` to report type/dimensions without relying on
// an external library.

export interface ImageInfo {
  /** e.g. "PNG", "JPEG", "GIF", "WEBP", "BMP" */
  format: string;
  /** MIME type, e.g. "image/png" */
  mime: string;
  width: number | null;
  height: number | null;
}

const UNKNOWN: ImageInfo = { format: 'Unknown', mime: 'application/octet-stream', width: null, height: null };

export function detectImageInfo(buffer: Buffer): ImageInfo {
  if (buffer.length < 12) return UNKNOWN;

  // PNG — signature 89 50 4E 47 0D 0A 1A 0A, IHDR chunk holds width/height.
  if (buffer.readUInt32BE(0) === 0x89504e47 && buffer.readUInt32BE(4) === 0x0d0a1a0a) {
    return {
      format: 'PNG',
      mime: 'image/png',
      width: buffer.readUInt32BE(16),
      height: buffer.readUInt32BE(20),
    };
  }

  // GIF — "GIF87a" or "GIF89a", dimensions right after the 6-byte signature.
  if (buffer.toString('ascii', 0, 3) === 'GIF') {
    return {
      format: 'GIF',
      mime: 'image/gif',
      width: buffer.readUInt16LE(6),
      height: buffer.readUInt16LE(8),
    };
  }

  // WEBP — "RIFF"....."WEBP", then a sub-chunk (VP8 , VP8L, or VP8X).
  if (buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') {
    const chunk = buffer.toString('ascii', 12, 16);
    if (chunk === 'VP8 ' && buffer.length >= 30) {
      return {
        format: 'WEBP',
        mime: 'image/webp',
        width: buffer.readUInt16LE(26) & 0x3fff,
        height: buffer.readUInt16LE(28) & 0x3fff,
      };
    }
    if (chunk === 'VP8L' && buffer.length >= 25) {
      const b = buffer.readUInt32LE(21);
      return {
        format: 'WEBP',
        mime: 'image/webp',
        width: (b & 0x3fff) + 1,
        height: ((b >> 14) & 0x3fff) + 1,
      };
    }
    if (chunk === 'VP8X' && buffer.length >= 30) {
      const width = (buffer[24] | (buffer[25] << 8) | (buffer[26] << 16)) + 1;
      const height = (buffer[27] | (buffer[28] << 8) | (buffer[29] << 16)) + 1;
      return { format: 'WEBP', mime: 'image/webp', width, height };
    }
    return { format: 'WEBP', mime: 'image/webp', width: null, height: null };
  }

  // BMP — "BM" signature, width/height as little-endian int32 at offset 18/22.
  if (buffer.toString('ascii', 0, 2) === 'BM' && buffer.length >= 26) {
    return {
      format: 'BMP',
      mime: 'image/bmp',
      width: buffer.readInt32LE(18),
      height: Math.abs(buffer.readInt32LE(22)),
    };
  }

  // JPEG — 0xFFD8, then a stream of markers; SOFn markers (0xC0-0xCF, except
  // 0xC4/0xC8/0xCC) hold the dimensions.
  if (buffer[0] === 0xff && buffer[1] === 0xd8) {
    let offset = 2;
    while (offset + 9 < buffer.length) {
      if (buffer[offset] !== 0xff) { offset++; continue; }
      const marker = buffer[offset + 1];
      if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd9)) {
        offset += 2;
        continue;
      }
      const length = buffer.readUInt16BE(offset + 2);
      const isSOF = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
      if (isSOF) {
        return {
          format: 'JPEG',
          mime: 'image/jpeg',
          height: buffer.readUInt16BE(offset + 5),
          width: buffer.readUInt16BE(offset + 7),
        };
      }
      offset += 2 + length;
    }
    return { format: 'JPEG', mime: 'image/jpeg', width: null, height: null };
  }

  return UNKNOWN;
}
