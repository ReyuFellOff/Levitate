import type { CassieClient } from '../../structures/CassieClient.js';
import { sendError, sendInfo, sendSuccess } from '../../components/statusMessages.js';
import { resolveCommand } from './disable-command.js';

export const options = {
  name: 'enable-command',
  aliases: [] as string[],
  description: 'Enable a previously disabled command.',
  usage: 'enable-command <command name or alias>',
  category: 'developer',
  owner: true,
  cooldown: 0,
};

export async function prefixExecute(message: any, args: string[], client: CassieClient) {
  if (!client.db) return sendError({ message }, 'Database is unavailable.');
  const input = args[0]?.trim();
  if (!input) return sendError({ message }, 'Please provide a command name or default alias.');

  const resolved = resolveCommand(client, input);
  if (!resolved) return sendError({ message }, `No command called \`${input}\` was found.`);

  const enabled = await client.db.enableCommand(resolved.name);
  if (!enabled) return sendInfo({ message }, `**${resolved.command.options.name}** is already enabled.`);
  return sendSuccess({ message }, `**${resolved.command.options.name}** has been enabled.`);
}