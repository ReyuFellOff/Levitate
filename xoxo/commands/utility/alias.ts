// xoxo/commands/utility/alias.ts
//
// Personal, per-user command aliases. A user can give any command they can
// use in the current server a private nickname — only they can invoke it via
// that nickname; everyone else still needs the real command name (or their
// own alias, if they set one).
//
// Prefix:  $alias                 — interactive panel: your own aliases
//          $alias [user | userId] — developers only: read-only view of that
//                                   user's aliases
//
// This command can never itself be given an alias — it's excluded from the
// "choose a command" dropdown, and the alias name "alias" is always rejected.

import type { LevitateClient } from '../../structures/LevitateClient.js';
import { sendError } from '../../components/statusMessages.js';
import { runAliasHomePanel } from '../../components/utility/alias.js';

export const options = {
  name:        'alias',
  aliases:     [] as string[],
  description: 'Create a personal, private nickname for any command you can use.',
  usage:       'alias\nalias [user | userId]',
  category:    'utility',
  owner:       false,
  cooldown:    3,
};

export async function prefixExecute(
  message: any,
  args:    string[],
  client:  LevitateClient,
): Promise<any> {
  const ctx = { message };
  if (!message.guild) return sendError(ctx, 'This command can only be used in a server.');
  if (!client.db) return sendError(ctx, 'Database is unavailable right now.');

  const developers: [string, string][] = client.config.developers;
  const isDeveloper = developers.some(([, id]: [string, string]) => id === message.author.id);

  let targetId = message.author.id;
  let targetTag = message.author.username;
  let readOnly = false;

  if (args[0]) {
    if (!isDeveloper) {
      return sendError(ctx, 'Only developers can view another user\'s aliases.');
    }

    const mention = message.mentions.users.first();
    const rawId = mention?.id ?? (/^\d{17,20}$/.test(args[0]) ? args[0] : null);
    if (!rawId) return sendError(ctx, 'Provide a valid user mention or ID.');

    const fetched = await client.users.fetch(rawId).catch((): null => null);
    if (!fetched) return sendError(ctx, 'Could not find that user.');

    targetId = fetched.id;
    targetTag = fetched.username;
    readOnly = targetId !== message.author.id;
  }

  return runAliasHomePanel(message, client, targetId, targetTag, readOnly, isDeveloper);
}
