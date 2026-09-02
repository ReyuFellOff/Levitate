import { createCanvas, loadImage } from '@napi-rs/canvas';

export interface DominantColor {
  hex: string;
  rgb: { r: number; g: number; b: number };
  hsl: { h: number; s: number; l: number };
}

function rgbToHsl(r: number, g: number, b: number): DominantColor['hsl'] {
  const red = r / 255;
  const green = g / 255;
  const blue = b / 255;
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const lightness = (max + min) / 2;
  const delta = max - min;
  let hue = 0;
  let saturation = 0;

  if (delta !== 0) {
    saturation = delta / (1 - Math.abs(2 * lightness - 1));
    if (max === red) hue = 60 * (((green - blue) / delta) % 6);
    else if (max === green) hue = 60 * ((blue - red) / delta + 2);
    else hue = 60 * ((red - green) / delta + 4);
    if (hue < 0) hue += 360;
  }

  return {
    h: Math.round(hue),
    s: Math.round(saturation * 100),
    l: Math.round(lightness * 100),
  };
}

function pixelWeight(r: number, g: number, b: number): number {
  const lightness = (Math.max(r, g, b) + Math.min(r, g, b)) / (2 * 255);
  const delta = Math.max(r, g, b) - Math.min(r, g, b);
  const saturation = delta / 255;
  const distanceFromEdge = Math.min(lightness, 1 - lightness);
  return (0.25 + saturation) * (0.25 + distanceFromEdge * 2);
}

export async function getDominantColor(url: string | null | undefined): Promise<DominantColor | null> {
  if (!url) return null;

  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const image = await loadImage(Buffer.from(await response.arrayBuffer()));
    const size = 32;
    const canvas = createCanvas(size, size);
    const context = canvas.getContext('2d');
    context.drawImage(image, 0, 0, size, size);
    const pixels = context.getImageData(0, 0, size, size).data;
    const buckets = new Map<number, { weight: number; r: number; g: number; b: number }>();
    const allBuckets = new Map<number, { count: number; r: number; g: number; b: number }>();

    for (let index = 0; index < pixels.length; index += 4) {
      const alpha = pixels[index + 3] ?? 0;
      if (alpha < 128) continue;
      const r = pixels[index] ?? 0;
      const g = pixels[index + 1] ?? 0;
      const b = pixels[index + 2] ?? 0;
      const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
      const allBucket = allBuckets.get(key) ?? { count: 0, r: 0, g: 0, b: 0 };
      allBucket.count++;
      allBucket.r += r;
      allBucket.g += g;
      allBucket.b += b;
      allBuckets.set(key, allBucket);

      const weight = pixelWeight(r, g, b);
      if (weight > 0.05) {
        const bucket = buckets.get(key) ?? { weight: 0, r: 0, g: 0, b: 0 };
        bucket.weight += weight;
        bucket.r += r * weight;
        bucket.g += g * weight;
        bucket.b += b * weight;
        buckets.set(key, bucket);
      }
    }

    const weighted = [...buckets.values()].sort((a, b) => b.weight - a.weight)[0];
    const dominant = weighted ?? [...allBuckets.values()].sort((a, b) => b.count - a.count)[0];
    if (!dominant) return null;
    const total = 'weight' in dominant ? dominant.weight : dominant.count;
    const rgb = {
      r: Math.round(dominant.r / total),
      g: Math.round(dominant.g / total),
      b: Math.round(dominant.b / total),
    };
    return {
      hex: `#${[rgb.r, rgb.g, rgb.b].map((value) => value.toString(16).padStart(2, '0')).join('').toUpperCase()}`,
      rgb,
      hsl: rgbToHsl(rgb.r, rgb.g, rgb.b),
    };
  } catch {
    return null;
  }
}

export function hexToDominantColor(hex: string | null | undefined): DominantColor | null {
  if (!hex || !/^#[0-9a-f]{6}$/i.test(hex)) return null;
  const rgb = {
    r: parseInt(hex.slice(1, 3), 16),
    g: parseInt(hex.slice(3, 5), 16),
    b: parseInt(hex.slice(5, 7), 16),
  };
  return { hex: hex.toUpperCase(), rgb, hsl: rgbToHsl(rgb.r, rgb.g, rgb.b) };
}
