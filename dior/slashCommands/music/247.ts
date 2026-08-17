import { SlashCommandBuilder, ChannelType } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('247')
  .setDescription('Manage 24/7 mode (bot stays in voice even after queue ends).')
  .addSubcommand((sub) =>
    sub
      .setName('enable')
      .setDescription('Enable 24/7 mode in a voice channel.')
      .addChannelOption((o) =>
        o.setName('channel')
          .setDescription('Voice channel to stay in (defaults to your current channel)')
          .setRequired(false)
          .addChannelTypes(ChannelType.GuildVoice, ChannelType.GuildStageVoice),
      ),
  )
  .addSubcommand((sub) => sub.setName('disable').setDescription('Disable 24/7 mode.'))
  .addSubcommand((sub) => sub.setName('view').setDescription('Show the current 24/7 channel.'));
