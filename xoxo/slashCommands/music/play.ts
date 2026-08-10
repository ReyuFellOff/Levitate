import { SlashCommandBuilder } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('play')
  .setDescription('Play a song or add it to the queue.')
  .addStringOption((o) => o.setName('song').setDescription('Song name or URL').setRequired(true));
