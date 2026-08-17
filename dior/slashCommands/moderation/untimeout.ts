import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('untimeout')
  .setDescription('Remove a timeout from one or more members.')
  .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
  .addUserOption((o) =>
    o.setName('user')
      .setDescription('The member to untimeout. Leave blank to pick from a list.')
      .setRequired(false),
  )
  .addStringOption((o) =>
    o.setName('reason')
      .setDescription('Reason for removing the timeout.')
      .setRequired(false)
      .setMaxLength(512),
  );
