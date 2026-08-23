import { SlashCommandBuilder, PermissionFlagsBits, ChannelType } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('delete-channel')
  .setDescription('Delete a channel after confirmation.')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
  .addChannelOption((o) =>
    o.setName('channel')
      .setDescription('Channel to delete (defaults to the current channel).')
      .addChannelTypes(
        ChannelType.GuildText,
        ChannelType.GuildAnnouncement,
        ChannelType.GuildVoice,
        ChannelType.GuildStageVoice,
        ChannelType.GuildForum,
        ChannelType.GuildMedia,
        ChannelType.GuildCategory,
      )
      .setRequired(false),
  )
  .addChannelOption((o) => o.setName('channel2').setDescription('Additional channel to delete.').setRequired(false))
  .addChannelOption((o) => o.setName('channel3').setDescription('Additional channel to delete.').setRequired(false))
  .addChannelOption((o) => o.setName('channel4').setDescription('Additional channel to delete.').setRequired(false))
  .addChannelOption((o) => o.setName('channel5').setDescription('Additional channel to delete.').setRequired(false));
