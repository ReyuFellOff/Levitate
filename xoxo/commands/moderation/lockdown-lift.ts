// xoxo/commands/moderation/lockdown-lift.ts
//
// Slash-only counterpart to /lockdown that unlocks every text channel.
// The prefix equivalent is `$lockdown unlock` (handled in lockdown.ts).

import type { LevitateClient } from '../../structures/LevitateClient.js';
import { runSlashLockdown } from './lockdown.js';

export const options = {
  name:        'lockdown-lift',
  aliases:     [] as string[],
  description: 'Unlock every text channel in the server.',
  usage:       'lockdown-lift [reason]',
  category:    'moderation',
  owner:       false,
  cooldown:    5,
};

export async function slashExecute(
  interaction: any,
  _client:     LevitateClient,
): Promise<any> {
  return runSlashLockdown(interaction, true);
}
