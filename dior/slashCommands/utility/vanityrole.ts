// xoxo/slashCommands/utility/vanityrole.ts
//
// Slash command builder for /vanityrole.
// Opens the same interactive panel as the prefix command.

import { SlashCommandBuilder } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('vanityrole')
  .setDescription('Configure automatic roles for status keyword or server tag triggers.')
  .setDefaultMemberPermissions(0x20) // ManageGuild
  .addSubcommand((s) =>
    s.setName('status').setDescription('Open the status / bio keyword trigger setup panel.'),
  )
  .addSubcommand((s) =>
    s.setName('bio').setDescription('Open the status / bio keyword trigger setup panel (alias for status).'),
  )
  .addSubcommand((s) =>
    s.setName('tag').setDescription('Open the server tag (clan tag) trigger setup panel.'),
  );
