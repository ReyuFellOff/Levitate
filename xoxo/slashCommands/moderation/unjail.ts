import { PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('unjail')
  .setDescription('Remove the Jailed role from a member.')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
  .addUserOption((o) =>
    o.setName('user')
      .setDescription('The member to unjail.')
      .setRequired(true),
  )
  .addStringOption((o) =>
    o.setName('reason')
      .setDescription('Reason for removing the Jailed role.')
      .setMaxLength(512)
      .setRequired(false),
  );