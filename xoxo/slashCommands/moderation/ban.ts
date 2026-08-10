import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('ban')
  .setDescription('Ban a member from this server.')
  .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
  .addUserOption((o) =>
    o.setName('user')
      .setDescription('The user to ban.')
      .setRequired(true),
  )
  .addStringOption((o) =>
    o.setName('reason')
      .setDescription('Reason for the ban.')
      .setRequired(false)
      .setMaxLength(512),
  )
  .addIntegerOption((o) =>
    o.setName('delete_days')
      .setDescription('How many days of messages to delete (0–7). Default: 0.')
      .setRequired(false)
      .setMinValue(0)
      .setMaxValue(7),
  );
