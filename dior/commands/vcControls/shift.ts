// xoxo/commands/vcControls/shift.ts
//
// Move a member to another voice channel.
// Defaults to moving the invoker to the bot's channel (or first VC).
//
// Prefix:  $shift [user] [channel]
// Slash:   /shift [user] [channel]

import { ChannelType, PermissionFlagsBits } from 'discord.js';
import type { LevitateClient } from '../../structures/LevitateClient.js';
import { sendSuccess, sendError } from '../../components/statusMessages.js';
import { resolveUser } from '../../helpers/userResolver.js';

export const options = {
  name:        'shift',
  aliases:     [] as string[],
  description: "Move a member to another voice channel. Defaults to yourself → bot's channel.",
  usage:       'shift [user] [channel]',
  category:    'vcControls',
  owner:       false,
  cooldown:    3,
};

function resolveVoiceChannel(guild: any, arg: string): any | null {
  const idMatch = arg.match(/^<#(\d+)>$/) ?? arg.match(/^(\d{17,20})$/);
  if (idMatch) {
    const ch = guild.channels.cache.get(idMatch[1]);
    return ch?.isVoiceBased?.() ? ch : null;
  }
  const lower = arg.toLowerCase();
  return (
    guild.channels.cache.find(
      (c: any) => c.isVoiceBased?.() && c.name.toLowerCase() === lower,
    ) ?? null
  );
}

function defaultDestChannel(guild: any): any | null {
  const botMember = guild.members.me;
  if (botMember?.voice?.channel) return botMember.voice.channel;
  return (
    guild.channels.cache
      .filter((c: any) => c.type === ChannelType.GuildVoice)
      .sort((a: any, b: any) => a.rawPosition - b.rawPosition)
      .first() ?? null
  );
}

async function handle(
  ctx:           { message?: any; interaction?: any },
  guild:         any,
  targetUser:    any,
  destChannel:   any,
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

  const sourceChannel = targetMember.voice.channel;
  const finalDest = destChannel ?? defaultDestChannel(guild);
  if (!finalDest) return sendError(ctx, 'No voice channel found to move to.');
  if (!finalDest.isVoiceBased?.()) return sendError(ctx, 'That destination is not a voice channel.');

  if (finalDest.id === sourceChannel.id) {
    return sendError(
      ctx,
      targetUser.id === commandUserId
        ? 'You are already in that voice channel.'
        : `<@${targetUser.id}> is already in that voice channel.`,
    );
  }

  const moved = await targetMember.voice.setChannel(finalDest).catch((): null => null);
  if (!moved) return sendError(ctx, 'Failed to move that member.');

  const text =
    targetUser.id === commandUserId
      ? `Moved you from <#${sourceChannel.id}> to <#${finalDest.id}>.`
      : `Moved <@${targetUser.id}> from <#${sourceChannel.id}> to <#${finalDest.id}>.`;
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
    return sendError(ctx, 'I need the **Move Members** permission to move members.');

  let targetUser = message.author;
  let destChannel: any = null;
  const remaining = [...args];

  if (remaining.length > 0) {
    const resolved = await resolveUser(client, message.guild, remaining[0]);
    if (resolved) {
      targetUser = resolved;
      remaining.shift();
    }
  }

  if (remaining.length > 0) {
    destChannel = resolveVoiceChannel(message.guild, remaining[0]);
  }

  return handle(ctx, message.guild, targetUser, destChannel, message.author.id);
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
    return sendError(ctx, 'I need the **Move Members** permission to move members.');

  const targetUser  = interaction.options.getUser('user') ?? interaction.user;
  const destChannel = interaction.options.getChannel('channel') ?? null;

  return handle(ctx, interaction.guild, targetUser, destChannel, interaction.user.id);
}
