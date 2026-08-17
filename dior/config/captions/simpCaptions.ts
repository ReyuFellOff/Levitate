// xoxo/config/simpCaptions.ts
//
// Captions for the $simp command, organised by percentage band.
// Uses the shared pickBandedCaption() helper from ratingCaptionUtils.

import { pickBandedCaption, type CaptionBand } from './ratingCaptionUtils.js';

export const simpCaptionBands: CaptionBand[] = [
  { min: 0,  max: 19,  captions: ['Emotionally unavailable.', 'Not simping today.', 'Cold-hearted and proud.'] },
  { min: 20, max: 39,  captions: ['A little soft, that\'s all.', 'Simp levels: low but rising.', 'Playing it cool. Barely.'] },
  { min: 40, max: 59,  captions: ['Officially caught feelings.', 'Simp meter: comfortably mid.', 'Sending one too many texts.'] },
  { min: 60, max: 79,  captions: ['Full simp mode engaged.', 'Would drop everything, no questions.', 'Certified simp behaviour.'] },
  { min: 80, max: 100, captions: ['Simp of the century.', 'There is no cure for this.', 'Dignity: fully surrendered.'] },
];

export const rareSimpCaption: string[] = [
  'Simp scale: shattered.',
  'This transcends simping.',
  'A new tier of devotion unlocked.',
];

export const infiniteSimpCaption: string[] = [
  'Unmeasurable simp energy.',
  'The developer wrote the rules. And broke them.',
  'Infinite loyalty detected.',
];

export function pickSimpCaption(pct: number): string {
  return pickBandedCaption(simpCaptionBands, rareSimpCaption, infiniteSimpCaption, pct);
}
