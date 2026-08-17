// xoxo/config/rizzCaptions.ts
//
// Captions for the $rizz command, organised by percentage band.
// Uses the shared pickBandedCaption() helper from ratingCaptionUtils.

import { pickBandedCaption, type CaptionBand } from './ratingCaptionUtils.js';

export const rizzCaptionBands: CaptionBand[] = [
  { min: 0,  max: 19,  captions: ['Negative rizz. Tragic.', 'The rizz left the chat.', 'Please stop talking.'] },
  { min: 20, max: 39,  captions: ['Rizz: still loading.', 'A rough opening line.', 'Needs serious work.'] },
  { min: 40, max: 59,  captions: ['Mid rizz, but it works sometimes.', 'Passable game.', 'Gets a reply. Occasionally.'] },
  { min: 60, max: 79,  captions: ['Solid W rizz.', 'The lines actually land.', 'Certified charmer.'] },
  { min: 80, max: 100, captions: ['Unspoken rizz god.', 'Never misses.', 'Rizz so strong it\'s unfair.'] },
];

export const rareRizzCaption: string[] = [
  'Rizz levels not found in nature.',
  'Broke the entire scale.',
  'This is basically cheating.',
];

export const infiniteRizzCaption: string[] = [
  'Unmeasurable rizz.',
  'The algorithm bows down.',
  'Infinite rizz detected.',
];

export function pickRizzCaption(pct: number): string {
  return pickBandedCaption(rizzCaptionBands, rareRizzCaption, infiniteRizzCaption, pct);
}
