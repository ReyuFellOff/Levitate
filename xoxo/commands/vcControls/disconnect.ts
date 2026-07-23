// xoxo/commands/vcControls/disconnect.ts
//
// Disconnect a member from their voice channel. Defaults to the invoker.
//
// Prefix:  $disconnect [user]
// Slash:   /disconnect [user]

import { PermissionFlagsBits } from 'discord.js';
import type { LevitateClient } from '../../structures/LevitateClient.js';
import { sendSuccess, sendError } from '../../components/statusMessages.js';
import { resolveUser } from '../../helpers/userResolver.js';

export const options = {
  name:        'disconnect',
  aliases:     ['dsc', 'devoice'] as string[],
  description: 'Disconnect a member from their voice channel. Defaults to yourself.',
  usage:       'disconnect [user]',
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

  // Use voiceStates cache directly — member.voice?.channel can read stale data
  // when the member object was freshly fetched from the REST API.
  const voiceState = guild.voiceStates.cache.get(targetUser.id);
  if (!voiceState?.channelId) {
    return sendError(
      ctx,
      targetUser.id === commandUserId
        ? 'You are not in any voice channel.'
        : `<@${targetUser.id}> is not in any voice channel.`,
    );
  }

  const sourceChannel = voiceState.channel ?? guild.channels.cache.get(voiceState.channelId);
  const disconnected = await targetMember.voice.disconnect().catch((): null => null);
  if (!disconnected) return sendError(ctx, 'Failed to disconnect that member.');

  const text =
    targetUser.id === commandUserId
      ? `Disconnected you from <#${sourceChannel.id}>.`
      : `Disconnected <@${targetUser.id}> from <#${sourceChannel.id}>.`;
  return sendSuccess(ctx, text);
}

export async function prefixExecute(
  message: any,
  args:    string[],
  client:  LevitateClient,
): Promise<any> {
  const ctx = { message };
  if (!message.guild) return sendError(ctx, 'This command can only be used in a server.');

  const invokerPerms = message.channel.permissionsFor?.(message.member);
  if (!invokerPerms?.has?.(PermissionFlagsBits.MoveMembers))
    return sendError(ctx, 'You need the **Move Members** permission to use this command.');

  const botMember = await message.guild.members.fetchMe().catch((): null => null);
  if (!botMember?.permissions?.has?.(PermissionFlagsBits.MoveMembers))
    return sendError(ctx, 'I need the **Move Members** permission to disconnect members.');

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
  client:      LevitateClient,
): Promise<any> {
  await interaction.deferReply();
  const ctx = { interaction };
  if (!interaction.guild) return sendError(ctx, 'This command can only be used in a server.');

  const invokerMember = interaction.member;
  if (!invokerMember?.permissions?.has?.(PermissionFlagsBits.MoveMembers))
    return sendError(ctx, 'You need the **Move Members** permission to use this command.');

  const botMember = await interaction.guild.members.fetchMe().catch((): null => null);
  if (!botMember?.permissions?.has?.(PermissionFlagsBits.MoveMembers))
    return sendError(ctx, 'I need the **Move Members** permission to disconnect members.');

  const targetUser = interaction.options.getUser('user') ?? interaction.user;
  return handle(ctx, interaction.guild, targetUser, interaction.user.id);
}
