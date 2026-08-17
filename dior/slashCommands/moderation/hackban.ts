import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('hackban')
  .setDescription('Ban a user by ID even if they are not in the server.')
  .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
  .addStringOption((o) =>
    o.setName('user_id')
      .setDescription('The user ID (snowflake) to ban.')
      .setRequired(true),
  )
  .addStringOption((o) =>
    o.setName('reason')
      .setDescription('Reason for the ban.')
      .setRequired(false)
      .setMaxLength(512),
  );
