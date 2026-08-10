import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('deafen')
  .setDescription('Server-deafen a member in voice. Defaults to yourself.')
  .setDefaultMemberPermissions(PermissionFlagsBits.DeafenMembers)
  .addUserOption((o) =>
    o.setName('user')
      .setDescription('Member to server-deafen. Defaults to you.')
      .setRequired(false),
  );
