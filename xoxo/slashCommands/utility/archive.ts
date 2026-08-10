import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('archive')
  .setDescription('Save recent channel messages to a file and DM it to you.')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
  .addIntegerOption((o) =>
    o.setName('count')
      .setDescription('Number of recent messages to archive (default 100, max 500).')
      .setRequired(false)
      .setMinValue(1)
      .setMaxValue(500),
  );
