// xoxo/commands/utility/embed.ts
//
// $embed — interactive live embed builder.
//
// Opens a message with a real, live-updating embed preview plus buttons to
// edit its basic info (title/description/color/url), author, footer, and
// images. Every edit is done through a modal and reflects instantly.
//
// All builder logic and payload construction lives in:
//   xoxo/components/utility/embed.ts

import type { LevitateClient } from '../../structures/LevitateClient.js';
import { sendError }           from '../../components/statusMessages.js';
import { startEmbedBuilderSession } from '../../components/utility/embed.js';

export const options = {
  name:        'embed',
  aliases:     ['embedbuilder', 'eb'] as string[],
  description: 'Interactively build an embed with a live preview and send or save it.',
  usage:       'embed',
  category:    'utility',
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

  // A real EmbedBuilder needs the "Embed Links" permission to render at all —
  // unlike the CV2 container builder. Without it Discord silently rejects the
  // send, so check up front and tell the user instead of doing nothing.
  const botPerms = message.channel.permissionsFor?.(message.guild.members.me);
  if (!botPerms?.has?.('EmbedLinks') || !botPerms?.has?.('SendMessages')) {
    await sendError(
      { message },
      'I need the **Embed Links** and **Send Messages** permissions in this channel to run the embed builder.',
    );
    return;
  }

  await startEmbedBuilderSession(message, client, message.author.id);
}
