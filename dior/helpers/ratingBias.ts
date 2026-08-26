// xoxo/helpers/ratingBias.ts
//
// Shared helper for the "$how<trait>" rating commands
// ($howcute, $intelligence, $gay, $autistic, $simp, $rizz). Resolves the
// percentage to show for a user: developer override → DB bias override →
// random roll.

import type { CassieClient } from '../structures/CassieClient.js';
import type { RatingCommandName } from '../database/database.js';
import { ratingDevValues } from '../config/rating/ratingDevValues.js';

export const DEV_ID = '922491166149214218';

/**
 * Resolve the final percentage for a user on a given rating command.
 * Priority: developer hard-coded value > saved DB bias > random roll.
 *
 * @param devValue - What the developer always gets. Defaults to the value
 *                   configured in xoxo/config/ratingDevValues.ts for this
 *                   command. Pass an explicit number to override it.
 */
export async function resolveRatingPct(
  client:   CassieClient,
  command:  RatingCommandName,
  userId:   string,
  roll:     () => number,
  devValue: number = ratingDevValues[command],
): Promise<number> {
  if (userId === DEV_ID) return devValue;

  const bias = await client.db.getRatingBias(command, userId).catch((): null => null);
  if (bias) {
    return bias.is_infinite ? Infinity : (bias.value ?? roll());
  }

  return roll();
}
