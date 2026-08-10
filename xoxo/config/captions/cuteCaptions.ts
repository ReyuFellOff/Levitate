// xoxo/config/cuteCaptions.ts
//
// Short captions for the $cute command, organised by percentage band.
// pickCuteCaption() picks randomly each time.
// Inner asterisks are escaped (\*) to avoid conflicting with outer italic
// wrappers in CV2 messages.

export interface CuteCaptionBand {
  min: number; // inclusive
  max: number; // inclusive
  captions: string[];
}

export const cuteCaptionBands: CuteCaptionBand[] = [
  {
    min: 0, max: 9,
    captions: [
      'The universe is still loading.',
      'Everyone has off days.',
      'Cuteness is subjective. Allegedly.',
      'Not the vibe right now.',
      'A rough day for the algorithm.',
      'The glow-up is a myth.',
    ],
  },
  {
    min: 10, max: 19,
    captions: [
      'Getting there. Very slowly.',
      'Almost cute. \*Almost.\*',
      'Potential: present. Delivery: pending.',
      'The glow-up is incoming.',
      'Low score, high character. Probably.',
      'Room for significant improvement.',
    ],
  },
  {
    min: 20, max: 29,
    captions: [
      'Not the cutest crayon in the box.',
      'Lovable in other ways.',
      'Personality carries the load.',
      'An acquired taste.',
      'Growing on people. Slowly.',
      'Cute\? Debatable. Lovable\? Sure.',
    ],
  },
  {
    min: 30, max: 39,
    captions: [
      'A slow-burn cutie.',
      'Hidden cuteness: detected.',
      'Quietly adorable.',
      'More cute than they think.',
      'Below average but charming.',
      'The underdog of cute.',
    ],
  },
  {
    min: 40, max: 49,
    captions: [
      'Solidly mid-cute.',
      'Comfortably in the cute middle.',
      'Nothing wrong with average.',
      'Decent levels of adorable.',
      'Right in the cute centre.',
      'Not bad. Not great.',
    ],
  },
  {
    min: 50, max: 59,
    captions: [
      'Giving cute energy.',
      'Pretty cute, honestly.',
      'People do notice.',
      'No complaints here.',
      'Above average on most days.',
      'Solidly in the cute zone.',
    ],
  },
  {
    min: 60, max: 69,
    captions: [
      'Noticeably cute.',
      'Heads are turning.',
      'Hard to ignore.',
      'Certified cute.',
      'The cuteness is real.',
      'A solid cute score.',
    ],
  },
  {
    min: 70, max: 79,
    captions: [
      'Very cute. Objectively.',
      'Making hearts flutter.',
      'Genuinely adorable.',
      'The cuteness speaks for itself.',
      'Hard to look away.',
      'Top tier adorable.',
    ],
  },
  {
    min: 80, max: 89,
    captions: [
      'Dangerously cute.',
      'Someone stop them.',
      'Warning: high cute levels.',
      'Too cute to function.',
      'Unreasonably adorable.',
      'Certifiably precious.',
    ],
  },
  {
    min: 90, max: 100,
    captions: [
      'Cuteness critical levels.',
      'Maximum cuteness achieved.',
      'How is this even legal\?',
      'Science cannot explain this.',
      'Off the charts cute.',
      'Cute emergency in progress.',
    ],
  },
];

/** Captions for the rare above-100% result. */
export const rareCuteCaption: string[] = [
  'The scale broke. Literally.',
  'Cute meter: obliterated.',
  'Numbers cannot contain this.',
  'Not equipped to measure this.',
  'System overload. Too cute.',
  'Beyond the bounds of cute.',
];

/** Captions for the developer (Infinite%). */
export const infiniteCuteCaption: string[] = [
  'The algorithm gave up.',
  'Cannot be quantified. Ever.',
  'Infinite cuteness detected.',
  'God-tier unlocked.',
  'This is simply unfair.',
  'The universe bows down.',
];

/**
 * Pick a random caption for the given percentage.
 * Handles Infinity (developer), >100 (rare), and 0–100 (normal).
 */
export function pickCuteCaption(pct: number): string {
  if (!isFinite(pct)) {
    return infiniteCuteCaption[Math.floor(Math.random() * infiniteCuteCaption.length)];
  }
  if (pct > 100) {
    return rareCuteCaption[Math.floor(Math.random() * rareCuteCaption.length)];
  }
  const band = cuteCaptionBands.find(b => pct >= b.min && pct <= b.max)
    ?? cuteCaptionBands[cuteCaptionBands.length - 1];
  return band.captions[Math.floor(Math.random() * band.captions.length)];
}
