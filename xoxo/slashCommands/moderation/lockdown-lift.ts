import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('lockdown-lift')
  .setDescription('Unlock every text channel in the server (with confirmation).')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addStringOption((o) =>
    o.setName('reason')
      .setDescription('Reason for lifting the lockdown.')
      .setRequired(false)
      .setMaxLength(512),
  );
