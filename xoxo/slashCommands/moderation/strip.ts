import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('strip')
  .setDescription("Remove all of a member's roles.")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
  .addUserOption((o) =>
    o.setName('user')
      .setDescription('The member to strip roles from.')
      .setRequired(true),
  );
