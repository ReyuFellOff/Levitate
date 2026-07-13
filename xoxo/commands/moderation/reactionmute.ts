// xoxo/commands/moderation/reactionmute.ts
//
// $reactionmute <@user|ID> [reason]
//
// Denies AddReactions for the target member in every accessible text channel
// in the server. Use $reactionunmute to reverse.
//
// Requires: ManageRoles (invoker + bot)

import { PermissionFlagsBits } from 'discord.js';
import type { LevitateClient }  from '../../structures/LevitateClient.js';
import { sendError, sendSuccess } from '../../components/statusMessages.js';
import { resolveUser }            from '../../helpers/userResolver.js';

export const options = {
  name:        'reactionmute',
  aliases:     ['rmute', 'reactmute'] as string[],
  description: 'Prevent a member from adding reactions anywhere in the server.',
  usage:       'reactionmute <@user|ID|username> [reason]',
  category:    'moderation',
  owner:       false,
  cooldown:    5,
};

// ── Shared logic ──────────────────────────────────────────────────────────────

async function doReactionMute(
  ctx:           { message?: any; interaction?: any },
  guild:         any,
  targetUser:    any,
  invokerMember: any,
  botMember:     any,
  reason:        string,
  developers:    [string, string][],
): Promise<any> {
  // Guard: target checks
  const invokerId = invokerMember?.user?.id ?? invokerMember?.id;
  if (targetUser.id === invokerId)
    return sendError(ctx, 'You cannot reaction-mute yourself.');
  if (targetUser.id === guild.ownerId)
    return sendError(ctx, 'You cannot reaction-mute the server owner.');
  if (targetUser.id === botMember?.user?.id)
    return sendError(ctx, 'I cannot reaction-mute myself.');
  if (developers.some(([, id]) => id === targetUser.id))
    return sendError(ctx, 'You cannot reaction-mute a bot developer.');

  const targetMember = await guild.members.fetch(targetUser.id).catch((): null => null);
  if (!targetMember) return sendError(ctx, `**${targetUser.username}** is not in this server.`);

  // Role hierarchy check
  const invokerTop = invokerMember?.roles?.highest?.position ?? 0;
  const targetTop  = targetMember.roles?.highest?.position   ?? 0;
  const botTop     = botMember?.roles?.highest?.position     ?? 0;
  const isOwner    = (invokerMember?.id ?? invokerMember?.user?.id) === guild.ownerId;

  if (!isOwner && targetTop >= invokerTop)
    return sendError(ctx, `You cannot reaction-mute **${targetUser.username}** — they have an equal or higher role.`);
  if (targetTop >= botTop)
    return sendError(ctx, `I cannot reaction-mute **${targetUser.username}** — their role is equal to or higher than mine.`);

  const auditReason = `Reaction-muted by ${targetUser.username} · ${reason}`.slice(0, 512);

  // Apply AddReactions:false to the member in every text channel
  const textChannels = [...guild.channels.cache.values()].filter(
    (ch: any) => ch.isTextBased?.() && !ch.isThread?.() && ch.permissionsFor?.(botMember)?.has?.(PermissionFlagsBits.ManageRoles),
  );

  await Promise.allSettled(
    textChannels.map((ch: any) =>
      ch.permissionOverwrites?.edit(targetMember, { AddReactions: false }, { reason: auditReason }),
    ),
  );

  return sendSuccess(
    ctx,
    `**${targetUser.username}** can no longer add reactions.${reason ? `\n-# Reason: ${reason}` : ''}`,
  );
}

// ── Prefix ────────────────────────────────────────────────────────────────────

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
    return sendError(ctx, 'I need the **Manage Roles** permission to reaction-mute members.');

  if (!args[0]) return sendError(ctx, `**Usage:** \`${client.config.prefix}${options.usage}\``);

  const targetUser = await resolveUser(client, message.guild, args[0]);
  if (!targetUser) return sendError(ctx, `Could not find a user matching \`${args[0]}\`.`);

  const reason = args.slice(1).join(' ').trim() || 'No reason provided.';

  return doReactionMute(ctx, message.guild, targetUser, message.member, botMember, reason, client.config.developers);
}
