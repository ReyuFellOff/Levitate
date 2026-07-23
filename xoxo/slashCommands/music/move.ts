import { SlashCommandBuilder } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('move')
  .setDescription('Move a track in the queue from one position to another.')
  .addIntegerOption((o) => o.setName('from').setDescription('Current queue position').setRequired(true).setMinValue(1))
  .addIntegerOption((o) => o.setName('to').setDescription('Target queue position').setRequired(true).setMinValue(1));
