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
  .setName('hide')
  .setDescription('Hide one or more channels from @everyone.')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
  .addChannelOption((o) =>
    o.setName('channel')
      .setDescription('Channel to hide (defaults to the current channel).')
      .addChannelTypes(...CHANNEL_TYPES)
      .setRequired(false),
  )
  .addChannelOption((o) =>
    o.setName('channel2')
      .setDescription('Second channel to hide.')
      .addChannelTypes(...CHANNEL_TYPES)
      .setRequired(false),
  )
  .addChannelOption((o) =>
    o.setName('channel3')
      .setDescription('Third channel to hide.')
      .addChannelTypes(...CHANNEL_TYPES)
      .setRequired(false),
  )
  .addChannelOption((o) =>
    o.setName('channel4')
      .setDescription('Fourth channel to hide.')
      .addChannelTypes(...CHANNEL_TYPES)
      .setRequired(false),
  )
  .addChannelOption((o) =>
    o.setName('channel5')
      .setDescription('Fifth channel to hide.')
      .addChannelTypes(...CHANNEL_TYPES)
      .setRequired(false),
  );
