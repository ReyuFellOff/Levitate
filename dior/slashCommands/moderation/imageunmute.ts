import { PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('imageunmute')
  .setDescription('Restore a member’s ability to send images.')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
  .addUserOption((o) => o.setName('user').setDescription('The member to unrestrict.').setRequired(true))
  .addStringOption((o) => o.setName('reason').setDescription('Reason for removing the restriction.').setMaxLength(512));