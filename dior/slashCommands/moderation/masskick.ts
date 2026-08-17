import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('masskick')
  .setDescription('Kick multiple members at once by providing their user IDs (max 50).')
  .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers)
  .addStringOption((o) =>
    o.setName('users')
      .setDescription('Space-separated Discord user IDs to kick.')
      .setRequired(true),
  );
