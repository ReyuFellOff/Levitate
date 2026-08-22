import { SlashCommandBuilder } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('song-cover')
  .setDescription('Search iTunes for a song and display its cover art.')
  .addStringOption((option) =>
    option
      .setName('query')
      .setDescription('Song name or "Song Name - Artist Name"')
      .setRequired(true),
  );
