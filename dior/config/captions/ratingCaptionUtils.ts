// xoxo/config/ratingCaptionUtils.ts
//
// Shared caption-picking logic for every "$how<trait>" style command
// ($howcute, $intelligence, $gay, $autistic, ...). Each command defines its
// own band/rare/infinite caption arrays and calls pickBandedCaption().

export interface CaptionBand {
  min: number; // inclusive
  max: number; // inclusive
  captions: string[];
}

/**
 * Pick a random caption for the given percentage.
 * Handles Infinity (developer), >100 (rare), and 0–100 (normal, banded).
 */
export function pickBandedCaption(
  bands:    CaptionBand[],
  rare:     string[],
  infinite: string[],
  pct:      number,
): string {
  if (!isFinite(pct)) {
    return infinite[Math.floor(Math.random() * infinite.length)];
  }
  if (pct > 100) {
    return rare[Math.floor(Math.random() * rare.length)];
  }
  const band = bands.find((b) => pct >= b.min && pct <= b.max)
    ?? bands[bands.length - 1];
  return band.captions[Math.floor(Math.random() * band.captions.length)];
}
