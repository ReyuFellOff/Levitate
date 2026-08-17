import { SlashCommandBuilder, PermissionFlagsBits, ChannelType } from 'discord.js';

const CHANNEL_TYPES = [ChannelType.GuildText, ChannelType.GuildAnnouncement] as const;

export const data = new SlashCommandBuilder()
  .setName('unlock')
  .setDescription('Unlock one or more previously locked channels.')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
  .addChannelOption((o) =>
    o.setName('channel')
      .setDescription('Channel to unlock (defaults to the current channel).')
      .addChannelTypes(...CHANNEL_TYPES)
      .setRequired(false),
  )
  .addChannelOption((o) =>
    o.setName('channel2')
      .setDescription('Second channel to unlock.')
      .addChannelTypes(...CHANNEL_TYPES)
      .setRequired(false),
  )
  .addChannelOption((o) =>
    o.setName('channel3')
      .setDescription('Third channel to unlock.')
      .addChannelTypes(...CHANNEL_TYPES)
      .setRequired(false),
  )
  .addChannelOption((o) =>
    o.setName('channel4')
      .setDescription('Fourth channel to unlock.')
      .addChannelTypes(...CHANNEL_TYPES)
      .setRequired(false),
  )
  .addChannelOption((o) =>
    o.setName('channel5')
      .setDescription('Fifth channel to unlock.')
      .addChannelTypes(...CHANNEL_TYPES)
      .setRequired(false),
  )
  .addStringOption((o) =>
    o.setName('reason')
      .setDescription('Reason for the unlock (shown in audit log).')
      .setRequired(false),
  );
