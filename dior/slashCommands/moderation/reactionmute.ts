import { PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('reactionmute')
  .setDescription('Prevent a member from adding reactions anywhere in the server.')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
  .addUserOption((o) => o.setName('user').setDescription('The member to restrict.').setRequired(true))
  .addStringOption((o) => o.setName('reason').setDescription('Reason for the restriction.').setMaxLength(512));