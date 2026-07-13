import { SlashCommandBuilder } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('rps')
  .setDescription('Play rock paper scissors against the bot, or challenge another user.')
  .addUserOption((o) =>
    o.setName('user')
      .setDescription('User to challenge. Leave blank to play against the bot.')
      .setRequired(false),
  );
