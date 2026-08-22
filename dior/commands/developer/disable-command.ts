import type { LevitateClient } from '../../structures/LevitateClient.js';
import { sendError, sendInfo, sendSuccess } from '../../components/statusMessages.js';
import { sendWrongUsage } from '../../components/wrongUsage.js';

export const options = {
  name: 'disable-command',
  aliases: [] as string[],
  description: 'Disable a command until a developer enables it again.',
  usage: 'disable-command <command name or alias> [reason]\ndisable-command list',
  category: 'developer',
  owner: true,
  cooldown: 0,
};

const MANAGEMENT_COMMANDS = new Set(['disable-command', 'enable-command']);

function resolveCommand(client: LevitateClient, input: string): { name: string; command: any } | null {
  const name = input.toLowerCase();
  const canonical = client.commands.has(name) ? name : client.aliases.get(name);
  if (!canonical) return null;
  const command = client.commands.get(canonical);
  return command ? { name: canonical, command } : null;
}

export async function prefixExecute(message: any, args: string[], client: LevitateClient) {
  if (!client.db) return sendError({ message }, 'Database is unavailable.');

  if (args[0]?.toLowerCase() === 'list') {
    const disabled = await client.db.getDisabledCommands();
    if (!disabled.length) return sendInfo({ message }, 'No commands are disabled.');
    return message.channel.send(
      `**Disabled commands**\n${disabled.map((entry) => `• \`${entry.command}\` — ${entry.reason}`).join('\n')}`,
    );
  }

  const input = args[0]?.trim();
  if (!input) return sendWrongUsage({ message, client }, options.name, options.usage);

  const resolved = resolveCommand(client, input);
  if (!resolved) return sendError({ message }, `No command called \`${input}\` was found.`);
  if (MANAGEMENT_COMMANDS.has(resolved.name)) {
    return sendError({ message }, 'The command management commands cannot be disabled.');
  }

  const reason = args.slice(1).join(' ').trim() || 'No reason provided.';
  await client.db.disableCommand(resolved.name, reason, message.author.id);
  return sendSuccess({ message }, `**${resolved.command.options.name}** has been disabled. Reason: ${reason}`);
}

export { resolveCommand };