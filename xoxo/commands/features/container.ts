// xoxo/commands/utility/container.ts
//
// $container — interactive CV2 message builder.
//
// Lets any server member build a Components V2 message interactively:
// add Text, Spacer, Info Card, Photo Grid, and Quick Links blocks; move,
// edit, duplicate, or remove them; pick an accent color; then send the
// finished message to any text channel.
//
// All builder logic and payload construction lives in:
//   xoxo/components/utility/container.ts

import type { LevitateClient }   from '../../structures/LevitateClient.js';
import { sendError }              from '../../components/statusMessages.js';
import { startBuilderSession }    from '../../components/utility/container.js';

export const options = {
  name:        'container',
  aliases:     ['cb', 'containerbuilder', 'build'] as string[],
  description: 'Interactively build a Components V2 container and send it to any channel.',
  usage:       'container',
  category:    'features',
  owner:       false,
  cooldown:    5,
};

export async function prefixExecute(
  message: any,
  _args:   string[],
  client:  LevitateClient,
): Promise<void> {
  if (!message.guild) {
    await sendError({ message }, 'This command can only be used in a server.');
    return;
  }

  await startBuilderSession(message, client, message.author.id);
}
