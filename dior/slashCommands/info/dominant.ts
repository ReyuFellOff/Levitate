import { SlashCommandBuilder } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('dominant')
  .setDescription("Show the dominant color of a user's avatar, the server icon, or the bot avatar.")
  .addStringOption((o) =>
    o.setName('target')
      .setDescription('User, server, or bot.')
      .setRequired(false),
  );
