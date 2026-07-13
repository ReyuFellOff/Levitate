// xoxo/commands/moderation/roleRemove.ts
//
// $roleremove — remove a role from a member, or open the multi-select picker.
//
// Usage:
//   $roleremove <@user|ID|username> [@role|ID|name]
//
// Omitting the role opens the interactive picker (xoxo/components/moderation/roleSelect.ts).

import { PermissionFlagsBits } from 'discord.js';
import type { LevitateClient } from '../../structures/LevitateClient.js';
import { sendError, sendInfo, sendSuccess } from '../../components/statusMessages.js';
import { resolveUser } from '../../helpers/userResolver.js';
import { sendRolePickerPanel } from '../../components/moderation/roleSelect.js';

export const options = {
  name:        'roleremove',
  aliases:     ['removerole', 'rr'] as string[],
  description: 'Remove a role from a member. Omit the role to open an interactive multi-select picker.',
  usage:       'roleremove <@user|ID|username> [@role|ID|name]',
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
  if (role.managed) return 'That role is managed by an integration and cannot be modified manually.';
  if (role.id === guild.id) return 'The @everyone role cannot be managed.';
  const botMember = guild.members.me;
  if (botMember && role.position >= botMember.roles.highest.position)
    return "I can't manage a role that is at or above my highest role.";
  if (invokerMember && role.position >= invokerMember.roles.highest.position)
    return "You can't modify a role that is at or above your own highest role.";
  return null;
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

  const targetUser = await resolveUser(client, guild, args[0]);
  if (!targetUser) return sendError(ctx, 'User not found. Try a mention, user ID, or username.');

  const member = await guild.members.fetch(targetUser.id).catch((): null => null);
  if (!member) return sendError(ctx, 'That user is not a member of this server.');

  // No role given — open the interactive multi-select picker.
  if (!args[1]) {
    return sendRolePickerPanel({ channel: message.channel }, guild, member, message.author.id, invokerMember);
  }

  const role = resolveRole(guild, args[1]);
  const roleErr = validateRole(guild, role, invokerMember);
  if (roleErr) return sendError(ctx, roleErr);

  if (!member.roles.cache.has(role.id))
    return sendInfo(ctx, `**${targetUser.username}** doesn't have the <@&${role.id}> role.`);

  await member.roles.remove(role, `Role remove by ${message.author.username}`);
  return sendSuccess(ctx, `Removed <@&${role.id}> from **${targetUser.username}**.`);
}
