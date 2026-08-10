// xoxo/slashCommands/info/developer.ts
// Builder only — execute logic lives in xoxo/commands/info/developer.ts.

import { SlashCommandBuilder } from 'discord.js';

export { slashExecute as slashExecute } from '../../commands/info/developer.js';

export const data = new SlashCommandBuilder()
  .setName('developer')
  .setDescription('Shows info about the developer behind this bot.');
