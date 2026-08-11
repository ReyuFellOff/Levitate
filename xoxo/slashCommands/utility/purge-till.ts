import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('purge-till')
  .setDescription('Delete a target message and all messages after it in this channel.')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
  .addStringOption((o) =>
    o
      .setName('target')
      .setDescription('Message ID or full Discord message link (must be in this channel).')
      .setRequired(true),
  )
  .addIntegerOption((o) =>
    o
      .setName('count')
      .setDescription('Max messages to delete AFTER the target (omit for all).')
      .setMinValue(1)
      .setMaxValue(1000)
      .setRequired(false),
  );
