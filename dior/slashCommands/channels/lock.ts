import { SlashCommandBuilder, PermissionFlagsBits, ChannelType } from 'discord.js';

const CHANNEL_TYPES = [ChannelType.GuildText, ChannelType.GuildAnnouncement] as const;

export const data = new SlashCommandBuilder()
  .setName('lock')
  .setDescription('Lock one or more channels so members cannot send messages or add reactions.')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
  .addChannelOption((o) =>
    o.setName('channel')
      .setDescription('Channel to lock (defaults to the current channel).')
      .addChannelTypes(...CHANNEL_TYPES)
      .setRequired(false),
  )
  .addChannelOption((o) =>
    o.setName('channel2')
      .setDescription('Second channel to lock.')
      .addChannelTypes(...CHANNEL_TYPES)
      .setRequired(false),
  )
  .addChannelOption((o) =>
    o.setName('channel3')
      .setDescription('Third channel to lock.')
      .addChannelTypes(...CHANNEL_TYPES)
      .setRequired(false),
  )
  .addChannelOption((o) =>
    o.setName('channel4')
      .setDescription('Fourth channel to lock.')
      .addChannelTypes(...CHANNEL_TYPES)
      .setRequired(false),
  )
  .addChannelOption((o) =>
    o.setName('channel5')
      .setDescription('Fifth channel to lock.')
      .addChannelTypes(...CHANNEL_TYPES)
      .setRequired(false),
  )
  .addStringOption((o) =>
    o.setName('reason')
      .setDescription('Reason for the lock (shown in audit log).')
      .setRequired(false),
  );
