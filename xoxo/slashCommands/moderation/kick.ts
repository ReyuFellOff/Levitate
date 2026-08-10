import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('kick')
  .setDescription('Kick a member from this server.')
  .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers)
  .addUserOption((o) =>
    o.setName('user')
      .setDescription('The member to kick.')
      .setRequired(true),
  )
  .addStringOption((o) =>
    o.setName('reason')
      .setDescription('Reason for the kick.')
      .setRequired(false)
      .setMaxLength(512),
  );
