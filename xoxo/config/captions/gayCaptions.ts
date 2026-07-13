// xoxo/config/gayCaptions.ts
//
// Short captions for the $gay command, organised by percentage band.
// pickGayCaption() picks randomly each time.
//
// Negative percentages mean the opposite — increasingly straight.
// 0% is baseline straight; -100% is maximum straightness.

import { pickBandedCaption, type CaptionBand } from './ratingCaptionUtils.js';

export const gayCaptionBands: CaptionBand[] = [
  {
    min: -100, max: -81,
    captions: [
      'The straightest person the algorithm has ever encountered.',
      'Physically allergic to glitter.',
      'The inverse of every fabulous trait. Completely.',
      'Straight to an extreme and impressive degree.',
      'The flag never existed here.',
      'Maximum straight energy. Historic.',
    ],
  },
  {
    min: -80, max: -61,
    captions: [
      'Extremely straight.',
      'The opposite of fabulous, through and through.',
      'Zero rainbow energy detected — ever.',
      'The straightest person in any room, easily.',
      'Glitter: a foreign concept.',
      'The flag has been resolutely folded.',
    ],
  },
  {
    min: -60, max: -41,
    captions: [
      'Very straight.',
      'The rainbow is nowhere in the vicinity.',
      'Fabulousness: not found.',
      'No glitter detected.',
      'Distinctly straight in every way.',
      'The flag is deeply, deeply folded.',
    ],
  },
  {
    min: -40, max: -21,
    captions: [
      'Noticeably straight.',
      'Comfortably on the straight side.',
      'The sparkle simply is not there.',
      'Decidedly un-fabulous.',
      'More than averagely straight.',
      'The rainbow dimmed significantly.',
    ],
  },
  {
    min: -20, max: -1,
    captions: [
      'A smidge more straight than average.',
      'Slightly to the straight side.',
      'A mild straight lean.',
      'Just a touch less fabulous than most.',
      'Barely below the line.',
      'Straight-adjacent, technically.',
    ],
  },
  {
    min: 0, max: 9,
    captions: [
      'Straight as an arrow today.',
      'The rainbow radar is quiet.',
      'Vibes: undetectable.',
      'Not clocking today.',
      'Off the gaydar completely.',
      'The flag stayed folded.',
    ],
  },
  {
    min: 10, max: 19,
    captions: [
      'A little flicker of fabulous.',
      'Faint rainbow energy.',
      'Getting warmer, chief.',
      'Slight sparkle detected.',
      'Barely on the radar.',
      'One glitter speck found.',
    ],
  },
  {
    min: 20, max: 29,
    captions: [
      'A hint of fabulous.',
      'Mild rainbow energy.',
      'Some sparkle, not much.',
      'Low-key iconic, sometimes.',
      'The vibes are shy.',
      'Rainbow signal: weak.',
    ],
  },
  {
    min: 30, max: 39,
    captions: [
      'Growing rainbow energy.',
      'Sneaky fabulous.',
      'The sparkle is building.',
      'Quietly iconic.',
      'More fabulous than they let on.',
      'The flag is unfolding.',
    ],
  },
  {
    min: 40, max: 49,
    captions: [
      'Comfortably in the middle.',
      'Balanced rainbow energy.',
      'Average fabulousness.',
      'Solid, unremarkable sparkle.',
      'Right down the middle.',
      'Textbook fabulous-adjacent.',
    ],
  },
  {
    min: 50, max: 59,
    captions: [
      'Giving main character energy.',
      'Rainbow radar: active.',
      'Noticeably fabulous.',
      'The vibes are strong.',
      'Sparkle levels rising.',
      'Certified icon-in-training.',
    ],
  },
  {
    min: 60, max: 69,
    captions: [
      'The flag is basically waving.',
      'Undeniably fabulous.',
      'Rainbow energy confirmed.',
      'Serving looks and vibes.',
      'The glitter is showing.',
      'Iconic behaviour detected.',
    ],
  },
  {
    min: 70, max: 79,
    captions: [
      'Full rainbow radiance.',
      'Serving fabulous realness.',
      'The vibes are immaculate.',
      'Certified icon status.',
      'Sparkling from every angle.',
      'Main character, fully unlocked.',
    ],
  },
  {
    min: 80, max: 89,
    captions: [
      'Dangerously fabulous.',
      'The rainbow is blinding.',
      'Icon of the century.',
      'Serving looks nonstop.',
      'Fabulousness overload.',
      'The glitter cannot be contained.',
    ],
  },
  {
    min: 90, max: 100,
    captions: [
      'Maximum rainbow achieved.',
      'The flag is fully deployed.',
      'Icon status: legendary.',
      'Fabulousness off the charts.',
      'The vibes broke the meter.',
      'Rainbow royalty confirmed.',
    ],
  },
];

/** Captions for the rare above-100% result. */
export const rareGayCaption: string[] = [
  'The pride flag ran out of colours.',
  'Fabulousness cannot be measured.',
  'The rainbow exceeded its own spectrum.',
  'Off the charts, off the flag.',
  'Science needs a bigger flag.',
  'Iconic beyond comprehension.',
];

/** Captions for the developer (Infinite%). */
export const infiniteGayCaption: string[] = [
  'The algorithm is obsessed.',
  'Cannot be quantified. Ever.',
  'Infinite fabulousness detected.',
  'Icon-tier unlocked.',
  'This is simply unfair.',
  'The universe is serving looks too.',
];

export function pickGayCaption(pct: number): string {
  return pickBandedCaption(gayCaptionBands, rareGayCaption, infiniteGayCaption, pct);
}
