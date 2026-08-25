import { PermissionFlagsBits } from 'discord.js';
import type { CassieClient } from '../../structures/CassieClient.js';
import { sendError } from '../../components/statusMessages.js';
import { startHoneypotSession } from '../../components/features/honeypot.js';

export const options = {
  name: 'honeypot',
  aliases: ['trap'] as string[],
  description: 'Configure a honeypot channel that moderates anyone who posts in it.',
  usage: 'honeypot setup',
  category: 'features',
  owner: false,
  cooldown: 3,
};

export async function prefixExecute(message: any, args: string[], client: CassieClient): Promise<any> {
  const ctx = { message };
  if (!message.guild) return sendError(ctx, 'This command can only be used in a server.');
  if (!message.member?.permissions?.has?.(PermissionFlagsBits.ManageGuild))
    return sendError(ctx, 'You need the **Manage Server** permission to configure the honeypot.');
  if (!client.db) return sendError(ctx, 'Database is unavailable right now.');
  if (args[0]?.toLowerCase() !== 'setup') return sendError(ctx, 'Use **honeypot setup** to configure the honeypot.');

  await startHoneypotSession(message, client);
}