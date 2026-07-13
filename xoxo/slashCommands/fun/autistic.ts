import { SlashCommandBuilder } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('autistic')
  .setDescription('See how autistic someone is.')
  .addUserOption((o) =>
    o.setName('user')
      .setDescription('The user to rate. Defaults to yourself.')
      .setRequired(false),
  );
