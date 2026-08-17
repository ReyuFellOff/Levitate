import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('unban')
  .setDescription('Unban a user from this server.')
  .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
  .addUserOption((o) =>
    o.setName('user')
      .setDescription('The user to unban. Leave blank to pick from a list.')
      .setRequired(false),
  )
  .addStringOption((o) =>
    o.setName('reason')
      .setDescription('Reason for the unban.')
      .setRequired(false)
      .setMaxLength(512),
  );
