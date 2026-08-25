import { ChannelType, PermissionFlagsBits } from 'discord.js';
import type { CassieClient } from '../../structures/CassieClient.js';
import { sendError, sendSuccess } from '../../components/statusMessages.js';
import { resolveTextChannel } from '../../helpers/textChannelResolver.js';
import {
  buildMediaChannelsPayload,
  getMediaChannelIds,
  invalidateMediaChannelCache,
} from '../../helpers/mediaChannel.js';

export const options = {
  name: 'media',
  aliases: [] as string[],
  description: 'Configure channels that only accept messages with media attachments.',
  usage: `media <channel>
media remove <channel>
media list`,
  category: 'channels',
  owner: false,
  cooldown: 3,
};

function isTextChannel(channel: any): boolean {
  return channel && (
    channel.type === ChannelType.GuildText ||
    channel.type === ChannelType.GuildAnnouncement
  );
}

function hasManageChannels(member: any): boolean {
  return !!member?.permissions?.has?.(PermissionFlagsBits.ManageChannels);
}

async function runMedia(
  ctx: { message?: any; interaction?: any },
  guild: any,
  client: CassieClient,
  action: string | undefined,
  rawChannel: string | undefined,
): Promise<any> {
  if (!client.db) return sendError(ctx, 'Database is unavailable right now.');

  const normalizedAction = action?.toLowerCase();
  const isList = !normalizedAction || normalizedAction === 'list' || normalizedAction === 'config';
  if (isList) {
    const channelIds = await getMediaChannelIds(client, guild.id);
    const payload = buildMediaChannelsPayload(guild, channelIds);
    if (ctx.interaction) return ctx.interaction.editReply(payload);
    return ctx.message.channel.send(payload);
  }

  if (
    normalizedAction !== 'set' &&
    normalizedAction !== 'remove' &&
    normalizedAction !== 'disable'
  ) {
    return sendError(ctx, 'Use `media <channel>`, `media set <channel>`, `media remove <channel>`, `media list`, or `media config`.');
  }

  const channel = rawChannel ? resolveTextChannel(guild, rawChannel) : null;
  if (!isTextChannel(channel)) {
    return sendError(ctx, 'Provide a valid text channel, for example `#media`.');
  }

  const botMember = guild.members.me ?? await guild.members.fetchMe().catch((): null => null);
  if (!channel.permissionsFor?.(botMember)?.has?.(PermissionFlagsBits.ManageMessages)) {
    return sendError(ctx, 'I need **Manage Messages** in that channel to enforce media-only messages.');
  }

  if (normalizedAction === 'set') {
    const result = await client.db.addMediaChannel(guild.id, channel.id);
    invalidateMediaChannelCache(guild.id);
    if (result === 'limit') {
      return sendError(ctx, 'This server already has the maximum number of media channels.');
    }
    if (result === 'exists') return sendSuccess(ctx, `<#${channel.id}> is already a media channel.`);
    return sendSuccess(ctx, `<#${channel.id}> is now a media channel.`);
  }

  const removed = await client.db.removeMediaChannel(guild.id, channel.id);
  invalidateMediaChannelCache(guild.id);
  return sendSuccess(
    ctx,
    removed ? `<#${channel.id}> is no longer a media channel.` : `<#${channel.id}> was not a media channel.`,
  );
}

export async function prefixExecute(message: any, args: string[], client: CassieClient): Promise<any> {
  if (!message.guild) return sendError({ message }, 'This command can only be used in a server.');
  if (!hasManageChannels(message.member)) {
    return sendError({ message }, 'You need the **Manage Channels** permission to use this command.');
  }

  const first = args[0]?.toLowerCase();
  const action = ['set', 'remove', 'disable', 'list', 'config'].includes(first) ? first : 'set';
  const rawChannel = first === 'set' || first === 'remove' || first === 'disable'
    ? args[1]
    : first === 'list' || first === 'config'
      ? undefined
      : args[0];
  return runMedia({ message }, message.guild, client, action, rawChannel);
}

export async function slashExecute(interaction: any, client: CassieClient): Promise<any> {
  await interaction.deferReply();
  if (!interaction.guild) return sendError({ interaction }, 'This command can only be used in a server.');
  if (!interaction.memberPermissions?.has?.(PermissionFlagsBits.ManageChannels)) {
    return sendError({ interaction }, 'You need the **Manage Channels** permission to use this command.');
  }

  const action = interaction.options.getSubcommand(false) ?? 'list';
  const channel = interaction.options.getChannel('channel', false);
  return runMedia({ interaction }, interaction.guild, client, action, channel?.id);
}