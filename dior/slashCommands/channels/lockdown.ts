import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('lockdown')
  .setDescription('Lock every text channel in the server (with confirmation).')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addStringOption((o) =>
    o.setName('reason')
      .setDescription('Reason for the lockdown.')
      .setRequired(false)
      .setMaxLength(512),
  );
