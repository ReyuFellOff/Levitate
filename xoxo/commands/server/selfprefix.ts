// xoxo/commands/server/selfprefix.ts
//
// $selfprefix — manage a personal prefix that works globally for the invoker.
//
// Usage:
//   $selfprefix <prefix>      — set a personal prefix (max 10 chars)
//   $selfprefix reset         — remove the personal prefix
//   $selfprefix remove        — alias for reset
//   $selfprefix               — show the current personal prefix
//
// No special permissions required — any user can set their own prefix.
// The self prefix works alongside the server prefix; both always work.

import type { LevitateClient } from '../../structures/LevitateClient.js';
import {
  sendSuccess,
  sendError,
  sendInfo,
} from '../../components/statusMessages.js';

export const options = {
  name:        'selfprefix',
  aliases:     ['sp', 'myprefix'] as string[],
  description: 'Set a personal command prefix that works for you across all servers.',
  usage:       'selfprefix [prefix | reset]',
  category:    'server',
  owner:       false,
  cooldown:    3,
};

const MAX_PREFIX_LEN = 10;

export async function prefixExecute(
  message: any,
  args:    string[],
  client:  LevitateClient,
): Promise<any> {
  const ctx = { message };

  if (!client.db) return sendError(ctx, 'Database is unavailable right now.');

  const sub = args[0]?.toLowerCase();

  // ── View current prefix ──────────────────────────────────────────────────
  if (!sub) {
    const current = client.userPrefixes.get(message.author.id);
    if (!current) {
      return sendInfo(ctx, "You don't have a personal prefix set. Use `selfprefix <prefix>` to set one.");
    }
    return sendInfo(ctx, `Your personal prefix is \`${current}\`.`);
  }

  // ── Remove / Reset ───────────────────────────────────────────────────────
  if (sub === 'reset' || sub === 'remove') {
    const had = client.userPrefixes.has(message.author.id);
    if (!had) {
      return sendInfo(ctx, "You don't have a personal prefix set — nothing to remove.");
    }
    let removed = false;
    try {
      removed = await client.db.removeUserSelfPrefix(message.author.id);
    } catch {
      removed = false;
    }
    if (!removed) {
      return sendError(ctx, 'Failed to remove your personal prefix. Please try again later.');
    }
    client.userPrefixes.delete(message.author.id);
    return sendSuccess(ctx, 'Your personal prefix has been removed. You can now only use the server prefix.');
  }

  // ── Set prefix ───────────────────────────────────────────────────────────
  const newPrefix = args[0]; // preserve original casing

  if (newPrefix.length > MAX_PREFIX_LEN) {
    return sendError(ctx, `Prefix is too long. Maximum length is **${MAX_PREFIX_LEN}** characters.`);
  }

  // Disallow whitespace-only prefixes
  if (newPrefix.trim().length === 0) {
    return sendError(ctx, 'Prefix cannot be blank or whitespace only.');
  }

  // Disallow prefix that is the same as the bot mention (prevent confusion)
  const botId = client.user?.id;
  if (botId && (newPrefix === `<@${botId}>` || newPrefix === `<@!${botId}>`)) {
    return sendError(ctx, 'You cannot use the bot mention as a prefix.');
  }

  try {
    await client.db.setUserSelfPrefix(message.author.id, newPrefix);
  } catch {
    return sendError(ctx, 'Failed to save your personal prefix. Please try again later.');
  }
  client.userPrefixes.set(message.author.id, newPrefix);

  return sendSuccess(
    ctx,
    `Your personal prefix has been set to \`${newPrefix}\`.\n` +
    `You can now use both the server prefix and your personal prefix anywhere.`,
  );
}
