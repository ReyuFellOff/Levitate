// xoxo/helpers/customRoleDispatch.ts
//
// Fired from messageCreate when the resolved command name doesn't match any
// real bot command. Checks if it's a guild-defined custom-role keyword and,
// when found, assigns (or removes) the linked roles to every @mentioned member.
//
// Rules enforced here (not in the command):
//   • Never fires on noprefix (usedPrefix === ''); callers must check.
//   • Invoker must have ManageRoles.
//   • Bot must have ManageRoles.
//   • Linked roles must be below the bot's highest role.
//   • Max 10 mentioned members acted on per invocation.
//   • Remove mode is triggered by any of: remove / rem / -remove / --remove / -r

import type { LevitateClient } from '../structures/LevitateClient.js';
import { PermissionFlagsBits }  from 'discord.js';
import { sendError, sendSuccess } from '../components/statusMessages.js';

const MAX_USERS_PER_USE = 10;
const REMOVE_TOKENS     = new Set(['remove', 'rem', '-remove', '--remove', '-r']);

export async function dispatchCustomRole(
  message:     any,
  commandName: string,
  args:        string[],
  client:      LevitateClient,
): Promise<boolean> {
  if (!message.guild || !client.db) return false;

  // ── Look up keyword ──────────────────────────────────────────────────────
  const doc = await client.db.getCustomRole(message.guild.id, commandName).catch((): null => null);
  if (!doc) return false; // not a custom role keyword — keep silent

  // ── Determine mode (add vs remove) ─────────────────────────────────────────
  const isRemoving = args.some((a) => REMOVE_TOKENS.has(a.toLowerCase()));

  // ── Permission: invoker ──────────────────────────────────────────────────
  const invoker = message.member;
  if (!invoker?.permissions?.has?.(PermissionFlagsBits.ManageRoles)) {
    await sendError(
      { message },
      `You need **Manage Roles** permission to use the \`${doc.keyword}\` custom role command.`,
    ).catch((): null => null);
    return true;
  }

  // ── Permission: bot ──────────────────────────────────────────────────────
  const botMember = message.guild.members.me;
  if (!botMember?.permissions?.has?.(PermissionFlagsBits.ManageRoles)) {
    await sendError(
      { message },
      'I need the **Manage Roles** permission to assign or remove roles.',
    ).catch((): null => null);
    return true;
  }

  // ── Target members ───────────────────────────────────────────────────────
  const members: any[] = [...message.mentions.members.values()].slice(0, MAX_USERS_PER_USE);
  if (members.length === 0) {
    const example = isRemoving
      ? `\`${doc.keyword} remove @user\``
      : `\`${doc.keyword} @user\``;
    await sendError(
      { message },
      `Mention at least one user — e.g. ${example}.`,
    ).catch((): null => null);
    return true;
  }

  // ── Resolve roles — must exist and be below bot's highest role ───────────
  const botHighest = botMember.roles.highest.position;
  const roles: any[] = doc.role_ids
    .map((id: string) => message.guild.roles.cache.get(id))
    .filter((r: any): r is NonNullable<typeof r> => !!r && r.position < botHighest);

  if (roles.length === 0) {
    await sendError(
      { message },
      `None of the roles linked to \`${doc.keyword}\` can be ${isRemoving ? 'removed' : 'assigned'} — make sure my highest role is above them all.`,
    ).catch((): null => null);
    return true;
  }

  // ── Apply role changes ────────────────────────────────────────────────────
  const roleIds     = roles.map((r: any) => r.id);
  const auditReason = `Custom role "${doc.keyword}" — ${isRemoving ? 'remove' : 'add'} by ${message.author.tag}`;
  let   succeeded   = 0;
  let   failed      = 0;

  for (const member of members) {
    try {
      if (isRemoving) {
        await member.roles.remove(roleIds, auditReason);
      } else {
        await member.roles.add(roleIds, auditReason);
      }
      succeeded++;
    } catch {
      failed++;
    }
  }

  // ── Reply ────────────────────────────────────────────────────────────────
  const roleList = roles.map((r: any) => `<@&${r.id}>`).join(', ');
  const userList = members.slice(0, succeeded).map((m: any) => `<@${m.id}>`).join(', ');
  let reply: string;

  if (isRemoving) {
    reply = `Removed ${roleList} from **${succeeded}** member${succeeded !== 1 ? 's' : ''} — ${userList}.`;
  } else {
    reply = `Gave ${roleList} to **${succeeded}** member${succeeded !== 1 ? 's' : ''} — ${userList}.`;
  }

  if (failed > 0) {
    reply += `\n-# ${failed} member${failed !== 1 ? 's' : ''} couldn't be updated (role hierarchy or missing permission).`;
  }

  await sendSuccess({ message }, reply).catch((): null => null);
  return true;
}
