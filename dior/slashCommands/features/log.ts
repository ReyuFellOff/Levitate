// xoxo/slashCommands/logging/log.ts
import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('log')
  .setDescription('Configure server logging (channel, member, role, vc, message, server, or all).')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addStringOption((o) =>
    o
      .setName('category')
      .setDescription('Jump straight to a category page.')
      .setRequired(false)
      .addChoices(
        { name: 'All', value: 'all' },
        { name: 'Channel', value: 'channel' },
        { name: 'Member', value: 'member' },
        { name: 'Role', value: 'role' },
        { name: 'VC', value: 'vc' },
        { name: 'Message', value: 'message' },
        { name: 'Server', value: 'server' },
      ),
  );
