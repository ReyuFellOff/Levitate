import { SlashCommandBuilder } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('peek')
  .setDescription('Preview a queued track by its position number.')
  .addIntegerOption(opt =>
    opt
      .setName('position')
      .setDescription('Queue position to peek at (e.g. 1 = next song).')
      .setRequired(true)
      .setMinValue(1),
  );
