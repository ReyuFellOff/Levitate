import { SlashCommandBuilder, PermissionFlagsBits, ChannelType } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('shift')
  .setDescription("Move a member to another voice channel. Defaults to the invoker's channel.")
  .setDefaultMemberPermissions(PermissionFlagsBits.MoveMembers)
  .addUserOption((o) =>
    o.setName('user')
      .setDescription('Member to move. Defaults to you.')
      .setRequired(false),
  )
  .addChannelOption((o) =>
    o.setName('channel')
      .setDescription("Destination voice channel. Defaults to the invoker's current channel.")
      .addChannelTypes(ChannelType.GuildVoice, ChannelType.GuildStageVoice)
      .setRequired(false),
  );
