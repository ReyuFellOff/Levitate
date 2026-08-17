import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('namestyle')
  .setDescription("Interactively set the bot's display name style for this server.")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild);
