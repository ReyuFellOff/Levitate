// xoxo/config/ratingDevValues.ts
//
// Central place to declare what percentage the developer (Reyansh) always
// gets on each "$how<trait>" style rating command. Used as the default
// `devValue` in resolveRatingPct() (xoxo/helpers/ratingBias.ts) unless a
// call site explicitly overrides it.
//
// Use `Infinity` for "always Infinite%", or any finite number (can be
// negative) for a fixed value.

import type { RatingCommandName } from '../database/database.js';

export const ratingDevValues: Record<RatingCommandName, number> = {
  cute:        Infinity,
  gay:         -1,
  autistic:    -1,
  intelligent: Infinity,
  simp:        67,
  rizz:        Infinity,
};
