// xoxo/helpers/customRoleDispatch.ts
//
// Fired from messageCreate when the resolved command name doesn't match any
// real bot command. Checks if it's a guild-defined custom-role keyword and,
// when found, assigns (or removes) the linked roles to every resolved member.
//
// Rules enforced here (not in the command):
//   • Never fires on noprefix (usedPrefix === ''); callers must check.
//   • Invoker must have the guild's configured access role.
//   • Server owners bypass the access-role check.
//   • Bot must have ManageRoles.
//   • Linked roles must be below the bot's highest role.
//   • Max 10 resolved members acted on per invocation.
//   • Remove mode is triggered by any of: remove / rem / -remove / --remove / -r

import type { CassieClient } from '../structures/CassieClient.js';
import { PermissionFlagsBits }  from 'discord.js';
import { sendError, sendSuccess } from '../components/statusMessages.js';
import { resolveUser } from './userResolver.js';

const MAX_USERS_PER_USE = 10;
const REMOVE_TOKENS     = new Set(['remove', 'rem', '-remove', '--remove', '-r']);

export async function dispatchCustomRole(
  message:     any,
  commandName: string,
  args:        string[],
  client:      CassieClient,
): Promise<boolean> {
  if (!message.guild || !client.db) return false;

  // ── Look up keyword ──────────────────────────────────────────────────────
  const doc = await client.db.getCustomRole(message.guild.id, commandName).catch((): null => null);
  if (!doc) return false; // not a custom role keyword — keep silent

  // ── Determine mode (add vs remove) ─────────────────────────────────────────
  const isRemoving = args.some((a) => REMOVE_TOKENS.has(a.toLowerCase()));

  // ── Permission: invoker ──────────────────────────────────────────────────
  const invoker = message.member;
  const isOwner = message.guild.ownerId === message.author?.id;
  const accessRoleId = await client.db.getCustomRoleAccessRoleId(message.guild.id).catch((): null => null);
  const hasAccessRole = !!accessRoleId && !!invoker?.roles?.cache?.has?.(accessRoleId);
  if (!isOwner && !hasAccessRole && !invoker?.permissions?.has?.(PermissionFlagsBits.Administrator)) {
    await sendError(
      { message },
      `You don't have permission to use the \`${doc.keyword}\` custom role command.`,
    ).catch((): null => null);
    return true;
  }

  // ── Permission: configured access role ────────────────────────────────────
  if (!isOwner && !hasAccessRole) {
    if (!accessRoleId) {
      await sendError(
        { message },
        'No server-wide access role is configured for custom roles. Ask an administrator to run `customrole access <@role>`.',
      ).catch((): null => null);
      return true;
    }
    const accessRole = message.guild.roles.cache.get(accessRoleId);
    const accessLabel = accessRole ? `<@&${accessRole.id}>` : 'the configured access role';
    await sendError(
      { message },
      `You need the ${accessLabel} role to use the \`${doc.keyword}\` custom role command.`,
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
  // Use the shared resolver so custom-role keywords accept mentions, user IDs,
  // username#discriminator tags, usernames, and display names consistently
  // with the rest of the bot.
  const targetArgs = args.filter((arg) => !REMOVE_TOKENS.has(arg.toLowerCase()));
  const members: any[] = [];
  const seenMemberIds = new Set<string>();

  for (const targetArg of targetArgs) {
    if (members.length >= MAX_USERS_PER_USE) break;

    const user = await resolveUser(client, message.guild, targetArg);
    if (!user || seenMemberIds.has(user.id)) continue;

    const member = message.guild.members.cache.get(user.id)
      ?? await message.guild.members.fetch(user.id).catch((): null => null);
    if (!member) continue;

    seenMemberIds.add(member.id);
    members.push(member);
  }

  if (members.length === 0) {
    await sendError(
      { message },
      'Provide at least one valid user mention, ID, or username.',
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
