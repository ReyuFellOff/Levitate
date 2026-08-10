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
  .setName('unhide')
  .setDescription('Unhide one or more previously hidden channels.')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
  .addChannelOption((o) =>
    o.setName('channel')
      .setDescription('Channel to unhide (defaults to the current channel).')
      .addChannelTypes(...CHANNEL_TYPES)
      .setRequired(false),
  )
  .addChannelOption((o) =>
    o.setName('channel2')
      .setDescription('Second channel to unhide.')
      .addChannelTypes(...CHANNEL_TYPES)
      .setRequired(false),
  )
  .addChannelOption((o) =>
    o.setName('channel3')
      .setDescription('Third channel to unhide.')
      .addChannelTypes(...CHANNEL_TYPES)
      .setRequired(false),
  )
  .addChannelOption((o) =>
    o.setName('channel4')
      .setDescription('Fourth channel to unhide.')
      .addChannelTypes(...CHANNEL_TYPES)
      .setRequired(false),
  )
  .addChannelOption((o) =>
    o.setName('channel5')
      .setDescription('Fifth channel to unhide.')
      .addChannelTypes(...CHANNEL_TYPES)
      .setRequired(false),
  );
