import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('warnings')
  .setDescription("View a member's warnings.")
  .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
  .addUserOption((o) =>
    o.setName('user')
      .setDescription('The member to check.')
      .setRequired(true),
  );
