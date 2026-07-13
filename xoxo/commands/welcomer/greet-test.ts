// xoxo/commands/welcomer/greet-test.ts
//
// $greet-test — send a test welcome message to the configured greet channel.

import { PermissionFlagsBits } from 'discord.js';
import type { LevitateClient } from '../../structures/LevitateClient.js';
import { sendError, sendSuccess } from '../../components/statusMessages.js';
import { sendGreetMessage } from '../../components/welcomer/greetSender.js';

export const options = {
  name:        'greet-test',
  aliases:     ['gtest'] as string[],
  description: 'Send a test welcome message to the configured greet channel.',
  usage:       'greet-test',
  category:    'welcomer',
  owner:       false,
  cooldown:    5,
};

export async function prefixExecute(
  message: any,
  _args:   string[],
  client:  LevitateClient,
): Promise<any> {
  const ctx = { message };
  if (!message.guild) return sendError(ctx, 'This command can only be used in a server.');

  if (!message.channel.permissionsFor?.(message.member)?.has?.(PermissionFlagsBits.ManageGuild))
    return sendError(ctx, 'You need the **Manage Server** permission to use this command.');

  if (!client.db) return sendError(ctx, 'Database is unavailable.');

  const result = await sendGreetMessage(message.member, client, true);

  if (!result.sent)
    return sendError(ctx, result.reason ?? 'Could not send the test greet message.');

  return sendSuccess(ctx, 'Test greet message sent to the configured channel.');
}
