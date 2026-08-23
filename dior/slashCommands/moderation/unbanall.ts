import { PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('unbanall')
  .setDescription('Unban every banned user from this server after confirmation.')
  .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers);