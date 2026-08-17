import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('warn')
  .setDescription('Warn a member.')
  .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
  .addUserOption((o) =>
    o.setName('user')
      .setDescription('The member to warn.')
      .setRequired(true),
  )
  .addStringOption((o) =>
    o.setName('reason')
      .setDescription('Reason for the warning.')
      .setRequired(true)
      .setMaxLength(512),
  );
