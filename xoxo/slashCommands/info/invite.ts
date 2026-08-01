import { SlashCommandBuilder } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('invite')
  .setDescription('Get the link to add this bot to your server and join the support server.');
