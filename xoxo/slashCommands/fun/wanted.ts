import { SlashCommandBuilder } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('wanted')
  .setDescription('Turn a user into a Wild West wanted poster.')
  .addUserOption((o) =>
    o.setName('user')
      .setDescription('The user to put on the poster. Defaults to yourself.')
      .setRequired(false),
  );
