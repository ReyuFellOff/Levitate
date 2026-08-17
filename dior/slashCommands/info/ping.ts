// xoxo/slashCommands/info/ping.ts
// Builder only — execute logic lives in xoxo/commands/info/ping.ts.

import { SlashCommandBuilder } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('ping')
  .setDescription("Check the bot's response time.");
