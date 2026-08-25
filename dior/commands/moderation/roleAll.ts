// xoxo/commands/moderation/roleAll.ts
//
// $roleall — give a role to every member of a target group (all / humans / bots).
//
// Usage:
//   $roleall <@role|ID|name>
//
// After providing the role, an interactive panel with three buttons appears
// letting the invoker choose who receives it:
//   • All Members — every member regardless of type
//   • Humans Only — excludes bots
//   • Bots Only   — only bot accounts
//
// Rate limiting: role assignments are processed in batches of 10 with a 1 second
// delay between batches so Discord's per-guild rate limit is never hit.

import { MessageFlags, PermissionFlagsBits } from 'discord.js';
import type { CassieClient } from '../../structures/CassieClient.js';
import { sendError } from '../../components/statusMessages.js';
import {
  buildRoleAllTargetPanel,
  buildRoleAllProgressPayload,
  buildRoleAllResultPayload,
  buildRoleAllTimedOutPayload,
  buildRoleAllCancelledPayload,
  type RoleAllTargetType,
} from '../../components/moderation/roleAll.js';

export const options = {
  name:        'roleall',
  aliases:     ['allrole', 'giveall'] as string[],
  description: 'Give a role to all members, humans only, or bots only.',
  usage:       'roleall <@role|ID|name>',
  category:    'moderation',
  owner:       false,
  cooldown:    10,
};

const BATCH_SIZE      = 10;
const BATCH_DELAY_MS  = 1000; // 10 role additions per second — well within Discord limits

function resolveRole(guild: any, arg: string): any | null {
  const idMatch = arg.match(/^<@&(\d+)>$/) ?? arg.match(/^(\d{17,20})$/);
  if (idMatch) return guild.roles.cache.get(idMatch[1]) ?? null;
  const lower = arg.toLowerCase();
  return guild.roles.cache.find((r: any) => r.name.toLowerCase() === lower) ?? null;
}

function validateRole(guild: any, role: any, invokerMember?: any): string | null {
  if (!role) return 'Role not found. Use a mention, role ID, or the exact role name.';
  if (role.managed) return 'That role is managed by an integration and cannot be assigned manually.';
  if (role.id === guild.id) return 'The @everyone role cannot be assigned.';
  const botMember = guild.members.me;
  if (botMember && role.position >= botMember.roles.highest.position)
    return "I can't manage a role that is at or above my highest role.";
  // Server owners implicitly outrank every role — skip the hierarchy check for them.
  const invokerIsOwner = invokerMember && invokerMember.id === guild.ownerId;
  if (!invokerIsOwner && invokerMember && role.position >= invokerMember.roles.highest.position)
    return "You can't assign a role that is at or above your own highest role.";
  return null;
}

async function runRoleAll(
  panel:      any,
  guild:      any,
  role:       any,
  targetType: RoleAllTargetType,
  invoker:    string,
): Promise<void> {
  // Show progress state immediately
  await panel.edit(buildRoleAllProgressPayload(role.name, targetType)).catch((): null => null);

  // Fetch all members; fall back to cache if intent not enabled
  let members: Map<string, any>;
  let usingCache = false;
  try {
    members = await guild.members.fetch();
  } catch {
    members = guild.members.cache;
    usingCache = true;
  }

  // Filter by target type
  const eligible: any[] = [];
  for (const [, member] of members) {
    if (targetType === 'humans' && member.user.bot) continue;
    if (targetType === 'bots' && !member.user.bot) continue;
    if (member.roles.cache.has(role.id)) continue; // already has it
    eligible.push(member);
  }

  let added   = 0;
  let failed  = 0;
  const skipped = [...members.values()].filter((m: any) => {
    if (targetType === 'humans' && m.user.bot) return false;
    if (targetType === 'bots' && !m.user.bot) return false;
    return m.roles.cache.has(role.id);
  }).length;

  const reason = `roleall (${targetType}) by ${invoker}`;

  // Process in batches to respect Discord rate limits
  for (let i = 0; i < eligible.length; i += BATCH_SIZE) {
    const batch = eligible.slice(i, i + BATCH_SIZE);
    await Promise.all(
      batch.map((member: any) =>
        member.roles
          .add(role, reason)
          .then(() => { added++; })
          .catch(() => { failed++; }),
      ),
    );
    // Delay between batches except after the last one
    if (i + BATCH_SIZE < eligible.length) {
      await new Promise<void>((resolve) => setTimeout(resolve, BATCH_DELAY_MS));
    }
  }

  await panel
    .edit(buildRoleAllResultPayload(role.name, role.id, targetType, added, skipped, failed, usingCache))
    .catch((): null => null);
}

export async function prefixExecute(
  message: any,
  args:    string[],
  client:  CassieClient,
): Promise<any> {
  const ctx   = { message };
  const guild = message.guild;
  if (!guild) return sendError(ctx, 'This command can only be used in a server.');

  const invokerMember = message.member;
  if (!message.channel.permissionsFor?.(invokerMember)?.has?.(PermissionFlagsBits.ManageRoles))
    return sendError(ctx, 'You need the **Manage Roles** permission to use this command.');

  if (!guild.members.me?.permissions?.has?.(PermissionFlagsBits.ManageRoles))
    return sendError(ctx, 'I need the **Manage Roles** permission.');

  if (!args[0]) return sendError(ctx, `Usage: \`${options.usage}\``);

  const role = resolveRole(guild, args[0]);
  const roleErr = validateRole(guild, role, invokerMember);
  if (roleErr) return sendError(ctx, roleErr);

  const token = `${message.id}-${Date.now()}`;
  const panel = await message.channel.send(
    buildRoleAllTargetPanel(role.name, role.id, guild.memberCount, token),
  ).catch((): null => null);

  if (!panel) return;

  const collector = panel.createMessageComponentCollector({
    filter: (i: any) => {
      if (!i.customId.startsWith('roleall:') || !i.customId.endsWith(`:${token}`)) return false;
      if (i.user.id !== message.author.id) {
        i.reply({ content: 'Only the person who ran this command can use this.', flags: MessageFlags.Ephemeral })
          .catch((): null => null);
        return false;
      }
      return true;
    },
    max:  1,
    time: 30_000,
  });

  collector.on('collect', async (i: any) => {
    await i.deferUpdate().catch((): null => null);
    const parts = i.customId.split(':');
    const action = parts[1] as string;

    if (action === 'cancel') {
      await panel.edit(buildRoleAllCancelledPayload()).catch((): null => null);
      return;
    }

    const targetType = action as RoleAllTargetType;
    await runRoleAll(panel, guild, role, targetType, message.author.username);
  });

  collector.on('end', async (collected: any, reason: string) => {
    if (reason === 'time') {
      await panel.edit(buildRoleAllTimedOutPayload()).catch((): null => null);
    }
  });
}
