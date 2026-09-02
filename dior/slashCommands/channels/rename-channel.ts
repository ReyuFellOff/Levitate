import { SlashCommandBuilder, PermissionFlagsBits, ChannelType } from 'discord.js';

const CHANNEL_TYPES = [
  ChannelType.GuildText,
  ChannelType.GuildAnnouncement,
  ChannelType.GuildVoice,
  ChannelType.GuildStageVoice,
  ChannelType.GuildForum,
  ChannelType.GuildMedia,
] as const;

export const data = new SlashCommandBuilder()
  .setName('rename-channel')
  .setDescription('Rename a channel.')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
  .addStringOption((o) =>
    o.setName('name')
      .setDescription('The new channel name (maximum 100 characters).')
      .setMaxLength(100)
      .setRequired(true),
  )
  .addChannelOption((o) =>
    o.setName('channel')
      .setDescription('Channel to rename.')
      .addChannelTypes(...CHANNEL_TYPES)
      .setRequired(true),
  );
