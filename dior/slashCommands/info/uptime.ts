// xoxo/slashCommands/info/uptime.ts
// Builder only — execute logic lives in xoxo/commands/info/uptime.ts.

import { SlashCommandBuilder } from 'discord.js';

export { slashExecute } from '../../commands/info/uptime.js';

export const data = new SlashCommandBuilder()
  .setName('uptime')
  .setDescription('Shows how long the bot has been online.');
