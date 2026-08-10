import { SlashCommandBuilder } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('skip')
  .setDescription('Skip the currently playing track.');
