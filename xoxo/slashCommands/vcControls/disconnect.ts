import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('disconnect')
  .setDescription('Disconnect a member from their voice channel. Defaults to yourself.')
  .setDefaultMemberPermissions(PermissionFlagsBits.MoveMembers)
  .addUserOption((o) =>
    o.setName('user')
      .setDescription('Member to disconnect. Defaults to you.')
      .setRequired(false),
  );
