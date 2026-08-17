// xoxo/commands/vcControls/undeafen.ts
//
// Remove server-deafen from a member in voice. Defaults to the invoker.
//
// Prefix:  $undeafen [user]
// Slash:   /undeafen [user]

import { PermissionFlagsBits } from 'discord.js';
import type { LevitateClient } from '../../structures/LevitateClient.js';
import { sendSuccess, sendError } from '../../components/statusMessages.js';
import { resolveUser } from '../../helpers/userResolver.js';

export const options = {
  name:        'undeafen',
  aliases:     [] as string[],
  description: 'Remove server-deafen from a member in voice. Defaults to yourself.',
  usage:       'undeafen [user]',
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

  if (!targetMember.voice.serverDeaf) {
    return sendError(
      ctx,
      targetUser.id === commandUserId
        ? 'You are not server-deafened.'
        : `<@${targetUser.id}> is not server-deafened.`,
    );
  }

  const undeafened = await targetMember.voice.setDeaf(false).catch((): null => null);
  if (!undeafened) return sendError(ctx, 'Failed to remove server-deafen from that member.');

  const text =
    targetUser.id === commandUserId
      ? `Undeafened you in <#${targetMember.voice.channel.id}>.`
      : `Undeafened <@${targetUser.id}> in <#${targetMember.voice.channel.id}>.`;
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
  if (!invokerPerms?.has?.(PermissionFlagsBits.DeafenMembers))
    return sendError(ctx, 'You need the **Deafen Members** permission to use this command.');

  const botMember = await message.guild.members.fetchMe().catch((): null => null);
  if (!botMember?.permissions?.has?.(PermissionFlagsBits.DeafenMembers))
    return sendError(ctx, 'I need the **Deafen Members** permission to remove server-deafens.');

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
  if (!invokerMember?.permissions?.has?.(PermissionFlagsBits.DeafenMembers))
    return sendError(ctx, 'You need the **Deafen Members** permission to use this command.');

  const botMember = await interaction.guild.members.fetchMe().catch((): null => null);
  if (!botMember?.permissions?.has?.(PermissionFlagsBits.DeafenMembers))
    return sendError(ctx, 'I need the **Deafen Members** permission to remove server-deafens.');

  const targetUser = interaction.options.getUser('user') ?? interaction.user;
  return handle(ctx, interaction.guild, targetUser, interaction.user.id);
}
