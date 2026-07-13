import { SlashCommandBuilder } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('userinfo')
  .setDescription("View detailed information about a user.")
  .addUserOption((o) =>
    o.setName('user')
      .setDescription('The user to look up. Defaults to yourself.')
      .setRequired(false),
  );
