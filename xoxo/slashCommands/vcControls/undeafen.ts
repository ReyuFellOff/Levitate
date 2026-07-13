import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('undeafen')
  .setDescription('Remove server-deafen from a member in voice. Defaults to yourself.')
  .setDefaultMemberPermissions(PermissionFlagsBits.DeafenMembers)
  .addUserOption((o) =>
    o.setName('user')
      .setDescription('Member to undeafen. Defaults to you.')
      .setRequired(false),
  );
