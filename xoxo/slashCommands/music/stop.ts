import { SlashCommandBuilder } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('stop')
  .setDescription('Stop playback and disconnect the bot.');
