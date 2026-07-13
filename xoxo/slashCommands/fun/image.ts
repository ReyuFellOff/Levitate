import { SlashCommandBuilder } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('image')
  .setDescription('Search for an image and browse results (strict safe-search enforced).')
  .addStringOption((o) =>
    o.setName('query')
      .setDescription('What to search for.')
      .setRequired(true)
      .setMaxLength(200),
  );
