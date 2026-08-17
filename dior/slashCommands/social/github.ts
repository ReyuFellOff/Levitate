import { SlashCommandBuilder } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('github')
  .setDescription('Show a GitHub profile and recent repositories.')
  .addStringOption((o) =>
    o
      .setName('username')
      .setDescription('The GitHub username to look up.')
      .setMaxLength(39)
      .setRequired(true),
  );