import { SlashCommandBuilder } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('peek')
  .setDescription('Peek at the currently playing track (minimal view).');
