import { SlashCommandBuilder } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('cinema')
  .setDescription('Search TMDB for a movie or TV show and show its details.')
  .addStringOption((o) =>
    o
      .setName('query')
      .setDescription('The movie or TV show name to search for.')
      .setMaxLength(200)
      .setRequired(true),
  );