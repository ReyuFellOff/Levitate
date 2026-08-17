// xoxo/config/autisticCaptions.ts
//
// Short captions for the $autistic command, organised by percentage band.
// Tone is affectionate/playful (special interests, hyperfocus, info-dumping),
// never mocking. pickAutisticCaption() picks randomly each time.
//
// Negative percentages mean the opposite — increasingly neurotypical.
// 0% is baseline neurotypical; -100% is maximum neurotypicality.

import { pickBandedCaption, type CaptionBand } from './ratingCaptionUtils.js';

export const autisticCaptionBands: CaptionBand[] = [
  {
    min: -100, max: -81,
    captions: [
      'The most neurotypical person on the planet.',
      'Not a single pattern spotted in their life.',
      'Hyperfocus? Never heard of it.',
      'Neurotypical to an extreme and impressive degree.',
      'The inverse of every trait. Completely.',
      'The algorithm has never seen anyone this NT.',
    ],
  },
  {
    min: -80, max: -61,
    captions: [
      'Extremely neurotypical.',
      'The opposite of hyperfocus, through and through.',
      'Zero special interests detected — ever.',
      'Routine-free and sensory-unbothered.',
      'Neurotypical standard-setter.',
      'Special interests: a foreign concept.',
    ],
  },
  {
    min: -60, max: -41,
    captions: [
      'Very neurotypical.',
      'No special interests to speak of.',
      'Sensory radar: fully offline.',
      'Stims are unheard of here.',
      'Distinctly neurotypical in every way.',
      'Routines are just loose suggestions.',
    ],
  },
  {
    min: -40, max: -21,
    captions: [
      'Noticeably neurotypical.',
      'Comfortably on the neurotypical side.',
      'Info-dumps? Never.',
      'Pattern-blind by nature.',
      'Decidedly NT and unbothered.',
      'The hyperfocus simply does not exist here.',
    ],
  },
  {
    min: -20, max: -1,
    captions: [
      'A smidge more neurotypical than average.',
      'Slightly to the neurotypical side.',
      'A mild neurotypical lean.',
      'Just a touch less hyperfocus than most.',
      'Barely below the line.',
      'Neurotypical-adjacent, technically.',
    ],
  },
  {
    min: 0, max: 9,
    captions: [
      'Completely neurotypical today.',
      'Not a single special interest in sight.',
      'Zero stimming detected.',
      'Blending in perfectly.',
      'The pattern recognition is offline.',
      'Totally by the book.',
    ],
  },
  {
    min: 10, max: 19,
    captions: [
      'A flicker of special interest.',
      'Slight hyperfocus detected.',
      'One tiny stim, barely noticeable.',
      'Starting to info-dump a little.',
      'The routine is loosely followed.',
      'A hint of pattern-spotting.',
    ],
  },
  {
    min: 20, max: 29,
    captions: [
      'Mild special interest energy.',
      'Occasional hyperfocus.',
      'A little bit of info-dumping.',
      'Some sensory preferences showing.',
      'The routine matters, a bit.',
      'Pattern radar: faint.',
    ],
  },
  {
    min: 30, max: 39,
    captions: [
      'Growing special interest.',
      'Hyperfocus building steam.',
      'Info-dumps getting longer.',
      'Noticing more patterns than most.',
      'The routine is becoming sacred.',
      'Sensory preferences are clear.',
    ],
  },
  {
    min: 40, max: 49,
    captions: [
      'Comfortably in the middle.',
      'Balanced hyperfocus levels.',
      'Average info-dump frequency.',
      'Routine-loving, but flexible.',
      'Solid pattern recognition.',
      'Textbook special-interest energy.',
    ],
  },
  {
    min: 50, max: 59,
    captions: [
      'Noticeable hyperfocus.',
      'The special interest is showing.',
      'Info-dumps are a regular thing.',
      'Routine is non-negotiable now.',
      'Pattern-spotting is strong.',
      'Stimming when excited, confirmed.',
    ],
  },
  {
    min: 60, max: 69,
    captions: [
      'Full hyperfocus mode.',
      'The special interest runs deep.',
      'Info-dump incoming, buckle up.',
      'Sensory details noticed instantly.',
      'The routine is sacred law.',
      'Pattern recognition: elite.',
    ],
  },
  {
    min: 70, max: 79,
    captions: [
      'Deep in the special interest.',
      'Hyperfocus: fully engaged.',
      'The info-dumps are legendary.',
      'Sensory awareness is next level.',
      'Routine disruption causes real chaos.',
      'Sees patterns nobody else does.',
    ],
  },
  {
    min: 80, max: 89,
    captions: [
      'Special interest has taken over.',
      'Hyperfocus cannot be interrupted.',
      'The info-dumps are a whole lecture.',
      'Every sensory detail is catalogued.',
      'The routine is law, not a suggestion.',
      'Pattern-spotting genius unlocked.',
    ],
  },
  {
    min: 90, max: 100,
    captions: [
      'Maximum special interest achieved.',
      'Hyperfocus levels: legendary.',
      'The info-dump could be a documentary.',
      'Sensory radar fully maxed out.',
      'The routine is a whole belief system.',
      'Pattern recognition off the charts.',
    ],
  },
];

/** Captions for the rare above-100% result. */
export const rareAutisticCaption: string[] = [
  'The special interest broke the scale.',
  'Hyperfocus cannot be measured.',
  'Info-dump exceeded all known limits.',
  'Science has no unit for this.',
  'Off the charts, off the routine.',
  'The pattern recognition transcended reality.',
];

/** Captions for the developer (Infinite%). */
export const infiniteAutisticCaption: string[] = [
  'The algorithm found its favourite person.',
  'Cannot be quantified. Ever.',
  'Infinite hyperfocus detected.',
  'Special-interest-tier unlocked.',
  'This is simply unfair.',
  'The universe is taking notes on this one.',
];

export function pickAutisticCaption(pct: number): string {
  return pickBandedCaption(autisticCaptionBands, rareAutisticCaption, infiniteAutisticCaption, pct);
}
