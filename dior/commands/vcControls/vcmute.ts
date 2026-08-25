// xoxo/commands/vcControls/vcmute.ts
//
// Server-mute a member in voice. Defaults to the invoker themselves.
// This is a VOICE server-mute — unrelated to timeout/chat mute.
//
// Prefix:  $vcmute [user]
// Slash:   /vcmute [user]

import { PermissionFlagsBits } from 'discord.js';
import type { CassieClient } from '../../structures/CassieClient.js';
import { sendSuccess, sendError } from '../../components/statusMessages.js';
import { resolveUser } from '../../helpers/userResolver.js';

export const options = {
  name:        'vcmute',
  aliases:     [] as string[],
  description: 'Server-mute a member in voice. Defaults to yourself.',
  usage:       'mute [user]',
  category:    'vcControls',
  owner:       false,
  cooldown:    3,
};

async function handle(
  ctx:           { message?: any; interaction?: any },
  guild:         any,
  targetUser:    any,
  commandUserId: string,
): Promise<any> {
  const targetMember = await guild.members.fetch(targetUser.id).catch((): null => null);
  if (!targetMember) return sendError(ctx, 'Could not find that user in this server.');

  if (!targetMember.voice?.channel) {
    return sendError(
      ctx,
      targetUser.id === commandUserId
        ? 'You are not in any voice channel.'
        : `<@${targetUser.id}> is not in any voice channel.`,
    );
  }

  if (targetMember.voice.serverMute) {
    return sendError(
      ctx,
      targetUser.id === commandUserId
        ? 'You are already server-muted.'
        : `<@${targetUser.id}> is already server-muted.`,
    );
  }

  const muted = await targetMember.voice.setMute(true).catch((): null => null);
  if (!muted) return sendError(ctx, 'Failed to server-mute that member.');

  const text =
    targetUser.id === commandUserId
      ? `Muted you in <#${targetMember.voice.channel.id}>.`
      : `Muted <@${targetUser.id}> in <#${targetMember.voice.channel.id}>.`;
  return sendSuccess(ctx, text);
}

export async function prefixExecute(
  message: any,
  args:    string[],
  client:  CassieClient,
): Promise<any> {
  const ctx = { message };
  if (!message.guild) return sendError(ctx, 'This command can only be used in a server.');

  const invokerPerms = message.channel.permissionsFor?.(message.member);
  if (!invokerPerms?.has?.(PermissionFlagsBits.MuteMembers))
    return sendError(ctx, 'You need the **Mute Members** permission to use this command.');

  const botMember = await message.guild.members.fetchMe().catch((): null => null);
  if (!botMember?.permissions?.has?.(PermissionFlagsBits.MuteMembers))
    return sendError(ctx, 'I need the **Mute Members** permission to server-mute members.');

  let targetUser = message.author;
  if (args[0]) {
    const resolved = await resolveUser(client, message.guild, args[0]);
    if (!resolved) return sendError(ctx, 'User not found. Try a mention, user ID, or username.');
    targetUser = resolved;
  }

  return handle(ctx, message.guild, targetUser, message.author.id);
}

export async function slashExecute(
  interaction: any,
  client:      CassieClient,
): Promise<any> {
  await interaction.deferReply();
  const ctx = { interaction };
  if (!interaction.guild) return sendError(ctx, 'This command can only be used in a server.');

  const invokerMember = interaction.member;
  if (!invokerMember?.permissions?.has?.(PermissionFlagsBits.MuteMembers))
    return sendError(ctx, 'You need the **Mute Members** permission to use this command.');

  const botMember = await interaction.guild.members.fetchMe().catch((): null => null);
  if (!botMember?.permissions?.has?.(PermissionFlagsBits.MuteMembers))
    return sendError(ctx, 'I need the **Mute Members** permission to server-mute members.');

  const targetUser = interaction.options.getUser('user') ?? interaction.user;
  return handle(ctx, interaction.guild, targetUser, interaction.user.id);
}
