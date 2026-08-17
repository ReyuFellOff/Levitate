// xoxo/config/intelligenceCaptions.ts
//
// Short captions for the $intelligence command, organised by percentage band.
// pickIntelligenceCaption() picks randomly each time.

import { pickBandedCaption, type CaptionBand } from './ratingCaptionUtils.js';

export const intelligenceCaptionBands: CaptionBand[] = [
  {
    min: 0, max: 9,
    captions: [
      'The brain cells are on strike.',
      'Room temperature IQ, and the room is cold.',
      'Thinking is optional today.',
      'Still loading common sense.',
      'The lights are on, nobody\'s home.',
      'A mystery to science.',
    ],
  },
  {
    min: 10, max: 19,
    captions: [
      'Getting warmer.',
      'Occasionally has a thought.',
      'Baby steps toward genius.',
      'The neurons are trying their best.',
      'Improving. Barely.',
      'Some assembly required.',
    ],
  },
  {
    min: 20, max: 29,
    captions: [
      'Street smart, not book smart.',
      'Knows enough to be dangerous.',
      'A few bricks short of a genius.',
      'Functional, mostly.',
      'Passable under pressure.',
      'Better than a coin flip.',
    ],
  },
  {
    min: 30, max: 39,
    captions: [
      'Underrated brainpower.',
      'Smarter than the average bear.',
      'Quietly competent.',
      'Sneaky intelligence.',
      'More capable than advertised.',
      'A slow but steady thinker.',
    ],
  },
  {
    min: 40, max: 49,
    captions: [
      'Solidly average IQ.',
      'Comfortably mid-brained.',
      'Nothing wrong with average.',
      'Reliable, if unremarkable.',
      'Textbook normal.',
      'Middle of the bell curve.',
    ],
  },
  {
    min: 50, max: 59,
    captions: [
      'Sharper than most.',
      'Above-average grey matter.',
      'Reads the room correctly.',
      'Occasionally impressive.',
      'Punches above its weight.',
      'Solid critical thinking.',
    ],
  },
  {
    min: 60, max: 69,
    captions: [
      'Noticeably clever.',
      'The smart friend.',
      'Quick on the uptake.',
      'Certified overthinker.',
      'Big brain energy building.',
      'Actually pays attention in class.',
    ],
  },
  {
    min: 70, max: 79,
    captions: [
      'Genuinely intelligent.',
      'Wins arguments with facts.',
      'The group\'s fact-checker.',
      'Impressively sharp.',
      'Reads between the lines effortlessly.',
      'Top-tier problem solver.',
    ],
  },
  {
    min: 80, max: 89,
    captions: [
      'Dangerously smart.',
      'Outsmarts everyone in the room.',
      'Certified genius behaviour.',
      'Too smart for their own good.',
      'The human encyclopedia.',
      'Big brain, bigger ego.',
    ],
  },
  {
    min: 90, max: 100,
    captions: [
      'IQ off the charts.',
      'Einstein is taking notes.',
      'Peak human intelligence.',
      'The final boss of smart.',
      'Cannot be out-thought.',
      'Galaxy brain unlocked.',
    ],
  },
];

/** Captions for the rare above-100% result. */
export const rareIntelligenceCaption: string[] = [
  'The IQ test broke.',
  'Numbers cannot measure this.',
  'Off the scale entirely.',
  'Science needs a new unit.',
  'Smarter than the test itself.',
  'Intelligence: undefined.',
];

/** Captions for the developer (Infinite%). */
export const infiniteIntelligenceCaption: string[] = [
  'The algorithm bows to this brain.',
  'Cannot be quantified. Ever.',
  'Infinite intelligence detected.',
  'God-tier IQ unlocked.',
  'This is simply unfair.',
  'The universe defers to this genius.',
];

export function pickIntelligenceCaption(pct: number): string {
  return pickBandedCaption(intelligenceCaptionBands, rareIntelligenceCaption, infiniteIntelligenceCaption, pct);
}
