import { SlashCommandBuilder } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('rizz')
  .setDescription('See how much rizz someone has.')
  .addUserOption((o) =>
    o.setName('user')
      .setDescription('The user to rate. Defaults to yourself.')
      .setRequired(false),
  );
