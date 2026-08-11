import { PermissionFlagsBits, SlashCommandBuilder, ChannelType } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('media')
  .setDescription('Configure channels that only accept messages with media attachments.')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
  .addSubcommand((s) =>
    s.setName('set')
      .setDescription('Set a channel as media-only.')
      .addChannelOption((o) =>
        o.setName('channel')
          .setDescription('The channel to restrict to media attachments.')
          .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
          .setRequired(true),
      ),
  )
  .addSubcommand((s) =>
    s.setName('remove')
      .setDescription('Remove a channel from the media-only list.')
      .addChannelOption((o) =>
        o.setName('channel')
          .setDescription('The media-only channel to remove.')
          .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
          .setRequired(true),
      ),
  )
  .addSubcommand((s) =>
    s.setName('disable')
      .setDescription('Remove a channel from the media-only list.')
      .addChannelOption((o) =>
        o.setName('channel')
          .setDescription('The media-only channel to remove.')
          .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
          .setRequired(true),
      ),
  )
  .addSubcommand((s) => s.setName('list').setDescription('List all media-only channels.'))
  .addSubcommand((s) => s.setName('config').setDescription('List all media-only channels.'));