import { ChannelType, SlashCommandBuilder } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('vcinfo')
  .setDescription('Show detailed information about a voice channel.')
  .addChannelOption((o) =>
    o.setName('channel')
      .setDescription('The voice channel to inspect.')
      .addChannelTypes(ChannelType.GuildVoice)
      .setRequired(true),
  );
