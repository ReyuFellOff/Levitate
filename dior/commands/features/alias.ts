// xoxo/commands/utility/alias.ts
//
// Personal, per-user command aliases.
//
// Prefix:
//   $alias create <name> <command name>
//   $alias delete <name>
//   $alias
//   $alias list

import type { CassieClient } from '../../structures/CassieClient.js';
import { sendError, sendSuccess } from '../../components/statusMessages.js';
import { MAX_PER_USER, runAliasList } from '../../components/utility/alias.js';

export const options = {
  name:        'alias',
  aliases:     [] as string[],
  description: 'Create, delete, or list your personal command aliases.',
  usage:       'alias create <name> <command name>\nalias delete <name>\nalias [list]',
  category:    'features',
  owner:       false,
  cooldown:    3,
};

const MAX_ALIAS_LEN = 14;
const ALIAS_NAME_RE = /^[a-zA-Z0-9_-]{1,14}$/;

function resolveCommandName(client: CassieClient, raw: string): string | null {
  const lower = raw.toLowerCase();
  if (client.commands.has(lower)) return lower;
  return client.aliases.get(lower) ?? null;
}

function validateAliasName(
  client: CassieClient,
  raw: string,
  existingAliases: { alias_lower: string }[],
): string | null {
  if (!raw) return 'Alias name cannot be empty.';
  if (raw.length > MAX_ALIAS_LEN) {
    return `Alias name must be **${MAX_ALIAS_LEN}** characters or fewer.`;
  }
  if (!ALIAS_NAME_RE.test(raw)) {
    return 'Alias name can only contain letters, numbers, `_` and `-` — no spaces or special characters.';
  }

  const lower = raw.toLowerCase();
  if (client.commands.has(lower) || client.aliases.has(lower)) {
    return `\`${raw}\` is already the name or a built-in alias of another command.`;
  }
  if (existingAliases.some((doc) => doc.alias_lower === lower)) {
    return `You already have a custom alias named \`${raw}\`.`;
  }
  return null;
}

export async function prefixExecute(
  message: any,
  args:    string[],
  client:  CassieClient,
): Promise<any> {
  const ctx = { message };
  if (!message.guild) return sendError(ctx, 'This command can only be used in a server.');
  if (!client.db) return sendError(ctx, 'Database is unavailable right now.');

  const action = args[0]?.toLowerCase();

  if (!action || action === 'list') {
    if (args.length > 1) {
      return sendError(ctx, 'Usage: `alias` or `alias list`.');
    }
    return runAliasList(message, client);
  }

  if (action === 'create') {
    const aliasName = args[1]?.trim() ?? '';
    const commandInput = args.slice(2).join(' ').trim();
    if (!aliasName || !commandInput) {
      return sendError(ctx, 'Usage: `alias create <name> <command name>`.');
    }

    const commandName = resolveCommandName(client, commandInput);
    if (!commandName) {
      return sendError(ctx, `Command \`${commandInput}\` was not found.`);
    }

    const existing = await client.db.getUserAliases(message.author.id);
    const nameError = validateAliasName(client, aliasName, existing);
    if (nameError) return sendError(ctx, nameError);
    if (existing.length >= MAX_PER_USER) {
      return sendError(ctx, `You've reached the maximum of **${MAX_PER_USER}** aliases.`);
    }
    if (existing.some((doc) => doc.command === commandName)) {
      return sendError(ctx, `You already have an alias for \`${commandName}\`.`);
    }

    const result = await client.db.createUserAlias(message.author.id, aliasName, commandName);
    if (result === 'duplicate_alias') {
      return sendError(ctx, `You already have a custom alias named \`${aliasName}\`.`);
    }
    if (result === 'duplicate_command') {
      return sendError(ctx, `You already have an alias for \`${commandName}\`.`);
    }
    if (result === 'limit') {
      return sendError(ctx, `You've reached the maximum of **${MAX_PER_USER}** aliases.`);
    }
    if (!result) return sendError(ctx, 'Failed to create the alias. Please try again.');

    if (!client.userAliases.has(message.author.id)) {
      client.userAliases.set(message.author.id, new Map());
    }
    client.userAliases.get(message.author.id)!.set(aliasName.toLowerCase(), commandName);
    return sendSuccess(ctx, `Created alias \`${aliasName}\` for \`${commandName}\`.`);
  }

  if (action === 'delete') {
    const aliasName = args[1]?.trim() ?? '';
    if (!aliasName || args.length > 2) {
      return sendError(ctx, 'Usage: `alias delete <name>`.');
    }

    const deleted = await client.db.deleteUserAlias(message.author.id, aliasName.toLowerCase());
    if (!deleted) return sendError(ctx, `You do not have a custom alias named \`${aliasName}\`.`);

    client.userAliases.get(message.author.id)?.delete(aliasName.toLowerCase());
    return sendSuccess(ctx, `Deleted alias \`${aliasName}\`.`);
  }

  return sendError(
    ctx,
    'Usage: `alias create <name> <command name>`, `alias delete <name>`, or `alias list`.',
  );
}
