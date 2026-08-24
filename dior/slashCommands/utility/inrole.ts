import { SlashCommandBuilder } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('inrole')
  .setDescription('List members who have a role.')
  .addStringOption((o) =>
    o.setName('role')
      .setDescription('A role mention, ID, or name.')
      .setRequired(true),
  );