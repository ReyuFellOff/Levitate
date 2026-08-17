import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('clearwarnings')
  .setDescription("Clear all of a member's warnings.")
  .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
  .addUserOption((o) =>
    o.setName('user')
      .setDescription('The member to clear warnings for.')
      .setRequired(true),
  );
