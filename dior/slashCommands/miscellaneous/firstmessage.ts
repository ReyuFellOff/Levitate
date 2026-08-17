import { SlashCommandBuilder } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('firstmessage')
  .setDescription('Show details about the first message ever sent in this channel.');
