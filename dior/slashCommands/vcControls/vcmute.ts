import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('vcmute')
  .setDescription('Server-mute a member in voice. Defaults to yourself.')
  .setDefaultMemberPermissions(PermissionFlagsBits.MuteMembers)
  .addUserOption((o) =>
    o.setName('user')
      .setDescription('Member to server-mute. Defaults to you.')
      .setRequired(false),
  );
