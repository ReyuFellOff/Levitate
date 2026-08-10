// xoxo/commands/moderation/role.ts
//
// $role — manage one member's roles.
//
// Usage:
//   $role add <@user|ID|username> [@role|ID|name]
//   $role remove <@user|ID|username> [@role|ID|name]
//   $role <@user|ID|username>
//
// When no role is supplied, all three forms open the combined role picker.

import { PermissionFlagsBits } from 'discord.js';
import type { LevitateClient } from '../../structures/LevitateClient.js';
import { sendError, sendInfo, sendSuccess } from '../../components/statusMessages.js';
import { resolveUser } from '../../helpers/userResolver.js';
import { sendRolePickerPanel } from '../../components/moderation/roleSelect.js';

export const options = {
  name:        'role',
  aliases:     [] as string[],
  description: 'Add or remove a role from a member, or open the combined role manager.',
  usage:       'role add <user> [role]\nrole remove <user> [role]\nrole <user>',
  category:    'moderation',
  owner:       false,
  cooldown:    3,
};

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

async function resolveTargetMember(
  message: any,
  args: string[],
  client: LevitateClient,
): Promise<{ targetUser: any; member: any } | null> {
  const targetUser = await resolveUser(client, message.guild, args[0]);
  if (!targetUser) {
    await sendError(
      { message },
      'User not found. Try a mention, user ID, or username.',
    );
    return null;
  }

  const member = await message.guild.members.fetch(targetUser.id).catch((): null => null);
  if (!member) {
    await sendError({ message }, 'That user is not a member of this server.');
    return null;
  }

  return { targetUser, member };
}

export async function prefixExecute(
  message: any,
  args:    string[],
  client:  LevitateClient,
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

  const action = args[0].toLowerCase();
  const hasAction = action === 'add' || action === 'remove';
  const targetArg = hasAction ? args[1] : args[0];
  const roleArg = hasAction ? args[2] : undefined;

  if (!targetArg || (!hasAction && args.length > 1)) {
    return sendError(ctx, `Usage: \`${options.usage}\``);
  }

  const resolved = await resolveTargetMember(message, [targetArg], client);
  if (!resolved) return;
  const { targetUser, member } = resolved;

  // No role given — every prefix form uses the same combined picker.
  if (!roleArg) {
    return sendRolePickerPanel({ channel: message.channel }, guild, member, message.author.id, invokerMember);
  }

  const role = resolveRole(guild, roleArg);
  const roleErr = validateRole(guild, role, invokerMember);
  if (roleErr) return sendError(ctx, roleErr);

  if (action === 'remove') {
    if (!member.roles.cache.has(role.id)) {
      return sendInfo(ctx, `**${targetUser.username}** doesn't have the <@&${role.id}> role.`);
    }
    await member.roles.remove(role, `Role remove by ${message.author.username}`);
    return sendSuccess(ctx, `Removed <@&${role.id}> from **${targetUser.username}**.`);
  }

  if (member.roles.cache.has(role.id)) {
    return sendInfo(ctx, `**${targetUser.username}** already has the <@&${role.id}> role.`);
  }
  await member.roles.add(role, `Role add by ${message.author.username}`);
  return sendSuccess(ctx, `Added <@&${role.id}> to **${targetUser.username}**.`);
}
