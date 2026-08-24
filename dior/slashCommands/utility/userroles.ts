import { SlashCommandBuilder } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('userroles')
  .setDescription('List the roles assigned to a user.')
  .addUserOption((o) =>
    o.setName('user')
      .setDescription('The user to inspect. Defaults to yourself.')
      .setRequired(false),
  );