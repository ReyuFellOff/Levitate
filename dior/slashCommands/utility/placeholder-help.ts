// xoxo/slashCommands/utility/placeholder-help.ts
import { SlashCommandBuilder } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('placeholder-help')
  .setDescription('Show all supported placeholder tokens with descriptions (paginated).');
