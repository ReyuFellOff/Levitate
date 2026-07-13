// xoxo/commands/moderation/reactionunmute.ts
//
// $reactionunmute <@user|ID> [reason]
//
// Reverses $reactionmute — removes the AddReactions:false override that was
// placed on the member in every text channel.
//
// Requires: ManageRoles (invoker + bot)

import { PermissionFlagsBits } from 'discord.js';
import type { LevitateClient }  from '../../structures/LevitateClient.js';
import { sendError, sendSuccess } from '../../components/statusMessages.js';
import { resolveUser }            from '../../helpers/userResolver.js';

export const options = {
  name:        'reactionunmute',
  aliases:     ['runmute', 'reactunmute'] as string[],
  description: 'Restore a member\'s ability to add reactions.',
  usage:       'reactionunmute <@user|ID|username> [reason]',
  category:    'moderation',
  owner:       false,
  cooldown:    5,
};

export async function prefixExecute(
  message: any,
  args:    string[],
  client:  LevitateClient,
): Promise<any> {
  const ctx = { message };
  if (!message.guild) return sendError(ctx, 'This command can only be used in a server.');

  const invokerPerms = message.channel.permissionsFor?.(message.member);
  if (!invokerPerms?.has?.(PermissionFlagsBits.ManageRoles))
    return sendError(ctx, 'You need the **Manage Roles** permission to use this command.');

  const botMember = message.guild.members.me;
  if (!botMember?.permissions?.has?.(PermissionFlagsBits.ManageRoles))
    return sendError(ctx, 'I need the **Manage Roles** permission to reaction-unmute members.');

  if (!args[0]) return sendError(ctx, `**Usage:** \`${client.config.prefix}${options.usage}\``);

  const targetUser = await resolveUser(client, message.guild, args[0]);
  if (!targetUser) return sendError(ctx, `Could not find a user matching \`${args[0]}\`.`);

  const targetMember = await message.guild.members.fetch(targetUser.id).catch((): null => null);
  if (!targetMember) return sendError(ctx, `**${targetUser.username}** is not in this server.`);

  const reason      = args.slice(1).join(' ').trim() || 'No reason provided.';
  const auditReason = `Reaction-unmuted by ${message.author.username} · ${reason}`.slice(0, 512);

  const textChannels = [...message.guild.channels.cache.values()].filter(
    (ch: any) => ch.isTextBased?.() && !ch.isThread?.() && ch.permissionsFor?.(botMember)?.has?.(PermissionFlagsBits.ManageRoles),
  );

  await Promise.allSettled(
    textChannels.map(async (ch: any) => {
      const existing = ch.permissionOverwrites?.cache?.get(targetMember.id);
      if (!existing) return;
      // If the only thing we set was AddReactions, delete the overwrite entirely;
      // otherwise just null it out so we don't wipe other overrides.
      await existing.edit({ AddReactions: null }, { reason: auditReason }).catch((): null => null);
    }),
  );

  return sendSuccess(
    ctx,
    `**${targetUser.username}** can add reactions again.${reason !== 'No reason provided.' ? `\n-# Reason: ${reason}` : ''}`,
  );
}
