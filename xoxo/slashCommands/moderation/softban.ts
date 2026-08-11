import { PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('softban')
  .setDescription('Ban then unban a member to clean up their messages.')
  .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
  .addUserOption((o) =>
    o.setName('user')
      .setDescription('The member to softban.')
      .setRequired(true),
  )
  .addStringOption((o) =>
    o.setName('history')
      .setDescription('How much message history to delete.')
      .setRequired(false)
      .addChoices(
        { name: 'Don’t delete any', value: 'none' },
        { name: 'Previous hour', value: '1h' },
        { name: 'Previous 6 hours', value: '6h' },
        { name: 'Previous 12 hours', value: '12h' },
        { name: 'Previous 24 hours', value: '1d' },
        { name: 'Previous 3 days', value: '3d' },
        { name: 'Previous 7 days', value: '7d' },
      ),
  )
  .addStringOption((o) =>
    o.setName('reason')
      .setDescription('Reason for the softban.')
      .setRequired(false)
      .setMaxLength(512),
  );