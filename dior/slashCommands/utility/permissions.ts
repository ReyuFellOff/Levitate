import { SlashCommandBuilder } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('permissions')
  .setDescription('Show the permissions a user has in this server.')
  .addUserOption((o) =>
    o.setName('user')
      .setDescription('The user to inspect. Defaults to yourself.')
      .setRequired(false),
  )
  .addStringOption((o) =>
    o.setName('role')
      .setDescription('A role mention, ID, or name to inspect instead.')
      .setRequired(false),
  );
