import { SlashCommandBuilder } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('accountage')
  .setDescription('Show how long a Discord account has existed.')
  .addUserOption((o) =>
    o.setName('user')
      .setDescription('The user to inspect. Defaults to yourself.')
      .setRequired(false),
  );
