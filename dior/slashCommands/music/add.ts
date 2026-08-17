import { SlashCommandBuilder } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('add')
  .setDescription('Add a song to the queue (bot must already be in a voice channel).')
  .addStringOption((o) => o.setName('song').setDescription('Song name or URL').setRequired(true));
