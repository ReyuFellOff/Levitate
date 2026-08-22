import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('vcunmute')
  .setDescription('Remove server-mute from a member in voice. Defaults to yourself.')
  .setDefaultMemberPermissions(PermissionFlagsBits.MuteMembers)
  .addUserOption((o) =>
    o.setName('user')
      .setDescription('Member to unmute. Defaults to you.')
      .setRequired(false),
  );
