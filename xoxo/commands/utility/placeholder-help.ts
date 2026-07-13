// xoxo/commands/utility/placeholder-help.ts
//
// Shows all supported placeholder tokens in a paginated CV2 panel.
// Pages: User | Server | Channel & Time | Bot & Misc
//
// Prefix:  $placeholders
// Slash:   /placeholders

import type { LevitateClient } from '../../structures/LevitateClient.js';
import { sendError } from '../../components/statusMessages.js';
import {
  buildPayload,
  registerPhHelpSession,
} from '../../components/placeholderHelp.js';

export const options = {
  name: 'placeholder-help',
  aliases: ['placeholders', 'ph', 'phhelp'] as string[],
  description: 'Show all supported placeholder tokens with descriptions.',
  usage: 'placeholder-help',
  category: 'utility',
  owner: false,
  cooldown: 3,
};

export async function prefixExecute(
  message: any,
  _args: string[],
  _client: LevitateClient,
): Promise<any> {
  if (!message.guild) {
    return sendError({ message }, 'This command can only be used in a server.');
  }

  const payload = buildPayload(0, false);
  const sentMsg = await (message.channel as any).send(payload).catch((): null => null);
  if (!sentMsg) return sendError({ message }, 'Failed to send the placeholder list.');

  registerPhHelpSession(sentMsg.id, message.author.id);
}

export async function slashExecute(
  interaction: any,
  _client: LevitateClient,
): Promise<any> {
  await interaction.deferReply();

  const payload = buildPayload(0, false);
  const sentMsg = await interaction.editReply(payload).catch((): null => null);
  if (!sentMsg) return;

  const msg = await interaction.fetchReply().catch((): null => null);
  if (msg) registerPhHelpSession(msg.id, interaction.user.id);
}
