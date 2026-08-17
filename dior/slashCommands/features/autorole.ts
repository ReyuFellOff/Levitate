// xoxo/slashCommands/utility/autorole.ts
//
// Slash command builder for /autorole.
// Opens the same interactive panel as the prefix command.

import { SlashCommandBuilder } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('autorole')
  .setDescription('Configure roles automatically given to new members and bots when they join.')
  .setDefaultMemberPermissions(0x10000000); // ManageRoles
