import { SlashCommandBuilder } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('skipto')
  .setDescription('Skip to a specific track in the queue.')
  .addIntegerOption((o) =>
    o.setName('position').setDescription('Queue position to jump to').setRequired(true).setMinValue(1),
  );
