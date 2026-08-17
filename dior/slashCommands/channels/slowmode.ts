import { SlashCommandBuilder, PermissionFlagsBits, ChannelType } from 'discord.js';

const CHANNEL_TYPES = [
  ChannelType.GuildText,
  ChannelType.GuildAnnouncement,
  ChannelType.GuildVoice,
  ChannelType.GuildForum,
  ChannelType.GuildMedia,
] as const;

export const data = new SlashCommandBuilder()
  .setName('slowmode')
  .setDescription('Set the slowmode for one or more channels (0 to disable, max 21600 s / 6 h).')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
  .addIntegerOption((o) =>
    o.setName('seconds')
      .setDescription('Slowmode delay in seconds (0 = disable, max 21600).')
      .setRequired(true)
      .setMinValue(0)
      .setMaxValue(21_600),
  )
  .addChannelOption((o) =>
    o.setName('channel')
      .setDescription('Channel to apply slowmode to (defaults to the current channel).')
      .addChannelTypes(...CHANNEL_TYPES)
      .setRequired(false),
  )
  .addChannelOption((o) =>
    o.setName('channel2')
      .setDescription('Second channel.')
      .addChannelTypes(...CHANNEL_TYPES)
      .setRequired(false),
  )
  .addChannelOption((o) =>
    o.setName('channel3')
      .setDescription('Third channel.')
      .addChannelTypes(...CHANNEL_TYPES)
      .setRequired(false),
  )
  .addChannelOption((o) =>
    o.setName('channel4')
      .setDescription('Fourth channel.')
      .addChannelTypes(...CHANNEL_TYPES)
      .setRequired(false),
  )
  .addChannelOption((o) =>
    o.setName('channel5')
      .setDescription('Fifth channel.')
      .addChannelTypes(...CHANNEL_TYPES)
      .setRequired(false),
  );
