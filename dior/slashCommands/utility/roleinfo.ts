import { SlashCommandBuilder } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('roleinfo')
  .setDescription('Show detailed information about a role.')
  .addStringOption((o) =>
    o.setName('role')
      .setDescription('Role mention, role ID, or text from the role name.')
      .setRequired(true)
      .setMaxLength(100),
  );