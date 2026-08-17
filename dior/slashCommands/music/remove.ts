import { SlashCommandBuilder } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('remove')
  .setDescription('Remove a track from the queue by position.')
  .addIntegerOption((o) =>
    o.setName('position').setDescription('Queue position to remove').setRequired(true).setMinValue(1),
  );
