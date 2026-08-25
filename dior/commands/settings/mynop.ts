// xoxo/commands/utility/mynop.ts
//
// Lets users (and developers) toggle their own noprefix access on or off.
// Regular users: gated to those with a valid, non-expired noprefix DB entry.
// Developers: permanent access by default; self-disable stored separately so
//             they don't appear in the $noprefix list.
import type { CassieClient } from '../../structures/CassieClient.js';
import { sendError, sendInfo, sendSuccess } from '../../components/statusMessages.js';

export const options = {
  name: 'mynop',
  aliases: ['mynoprefix'] as string[],
  description: 'Toggle your own noprefix access on or off.',
  usage: `mynop
  mynop on
  mynop off`,
  category: 'settings',
  owner: false,
  cooldown: 3,
};

function formatExpiry(expiresAt: Date | null): string {
  if (!expiresAt) return '**permanent**';
  const s = Math.floor(expiresAt.getTime() / 1000);
  return `<t:${s}:R> (on <t:${s}:f>)`;
}

export async function prefixExecute(message: any, args: string[], client: CassieClient) {
  if (!client.db) return sendError({ message }, 'Database is not available right now.');

  const isDeveloper = client.config.developers.some(([, id]: [string, string]) => id === message.author.id);
  const action = args[0]?.toLowerCase();

  // ── Developer path ───────────────────────────────────────────────────────────
  // Devs have permanent noprefix by default; self-disable stored in a separate
  // settings doc so they don't pollute the $noprefix list.
  if (isDeveloper) {
    const devDisabled = await client.db.isDevNoprefixSelfDisabled(message.author.id).catch((): boolean => false);

    if (!action) {
      return sendInfo(
        { message },
        [
          `**Your noprefix:** ${devDisabled ? 'disabled' : 'enabled'} (developer — permanent)`,
          `Use \`${client.config.prefix}mynop on\` / \`${client.config.prefix}mynop off\` to toggle.`,
        ].join('\n'),
      );
    }

    if (action === 'on' || action === 'enable') {
      if (!devDisabled) return sendInfo({ message }, 'Noprefix is already enabled for you.');
      await client.db.setDevNoprefixSelfDisabled(message.author.id, false);
      return sendSuccess({ message }, 'Noprefix **enabled**. (Developer — permanent access)');
    }

    if (action === 'off' || action === 'disable') {
      if (devDisabled) return sendInfo({ message }, 'Noprefix is already disabled for you.');
      await client.db.setDevNoprefixSelfDisabled(message.author.id, true);
      return sendSuccess({ message }, `Noprefix **disabled**. Use \`${client.config.prefix}mynop on\` to re-enable.`);
    }

    return sendError({ message }, `Unknown action \`${action}\`. Use \`on\` or \`off\`.`);
  }

  // ── Regular user path ────────────────────────────────────────────────────────
  // Fetch the raw DB entry — bypass isNoPrefixUser so a self-disabled user
  // can still run $mynop on to re-enable (they still have the regular prefix).
  const entry = await client.db.getNoPrefixUserEntry(message.author.id).catch((): null => null);

  // Entry must exist and must not be expired.
  const now = Date.now();
  const isExpiredOrMissing = !entry || (entry.expiresAt !== null && entry.expiresAt.getTime() <= now);
  if (isExpiredOrMissing) {
    return sendError({ message }, "You don't have noprefix access, so there's nothing to toggle.");
  }

  // ── No args → status ────────────────────────────────────────────────────────
  if (!action) {
    const isOn = entry.selfDisabled !== true;
    return sendInfo(
      { message },
      [
        `**Your noprefix:** ${isOn ? 'enabled' : 'disabled'}`,
        `**Expires:** ${formatExpiry(entry.expiresAt)}`,
        `Use \`${client.config.prefix}mynop on\` / \`${client.config.prefix}mynop off\` to toggle.`,
      ].join('\n'),
    );
  }

  // ── on / enable ─────────────────────────────────────────────────────────────
  if (action === 'on' || action === 'enable') {
    if (entry.selfDisabled !== true) {
      return sendInfo({ message }, 'Noprefix is already enabled for you.');
    }
    await client.db.setSelfNoPrefixDisabled(message.author.id, false);
    return sendSuccess({ message }, `Noprefix **enabled**. Expires: ${formatExpiry(entry.expiresAt)}`);
  }

  // ── off / disable ────────────────────────────────────────────────────────────
  if (action === 'off' || action === 'disable') {
    if (entry.selfDisabled === true) {
      return sendInfo({ message }, 'Noprefix is already disabled for you.');
    }
    await client.db.setSelfNoPrefixDisabled(message.author.id, true);
    return sendSuccess(
      { message },
      `Noprefix **disabled**. Use \`${client.config.prefix}mynop on\` to re-enable anytime (while your access is still valid).`,
    );
  }

  return sendError({ message }, `Unknown action \`${action}\`. Use \`on\` or \`off\`.`);
}
