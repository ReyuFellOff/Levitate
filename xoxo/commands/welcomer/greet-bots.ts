// xoxo/commands/welcomer/greet-bots.ts
//
// $greet-bots — toggle whether bots that join this server receive a welcome message.
//
// Usage:
//   $greet-bots        — toggle (flips current state)
//   $greet-bots on     — enable bot greets
//   $greet-bots off    — disable bot greets

import { PermissionFlagsBits } from 'discord.js';
import type { LevitateClient } from '../../structures/LevitateClient.js';
import { sendError, sendSuccess } from '../../components/statusMessages.js';

export const options = {
  name:        'greet-bots',
  aliases:     ['gbots'] as string[],
  description: 'Toggle whether bots that join this server receive a welcome message.',
  usage: `greet-bots
greet-bots on
greet-bots off`,
  category: 'welcomer',
  owner:    false,
  cooldown: 3,
};

export async function prefixExecute(
  message: any,
  args:    string[],
  client:  LevitateClient,
): Promise<any> {
  const ctx = { message };
  if (!message.guild) return sendError(ctx, 'This command can only be used in a server.');

  if (!message.channel.permissionsFor?.(message.member)?.has?.(PermissionFlagsBits.ManageGuild))
    return sendError(ctx, 'You need the **Manage Server** permission to use this command.');

  if (!client.db) return sendError(ctx, 'Database is unavailable.');

  const raw      = args[0]?.toLowerCase();
  const current  = await client.db.getGreetSettings(message.guild.id).catch((): null => null);
  const newValue = raw === 'on' ? true : raw === 'off' ? false : !(current?.greet_bots ?? false);

  await client.db.setGreetBots(message.guild.id, newValue);

  return sendSuccess(
    ctx,
    newValue
      ? 'Bot greet enabled — bots that join this server will now receive a welcome message.'
      : 'Bot greet disabled — bots that join this server will be silently ignored.',
  );
}
