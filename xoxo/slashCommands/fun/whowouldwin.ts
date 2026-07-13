import { SlashCommandBuilder } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('whowouldwin')
  .setDescription('See who would win in a battle between two users.')
  .addUserOption((o) =>
    o.setName('user')
      .setDescription('First user (or the opponent if only one is provided — you vs them).')
      .setRequired(true),
  )
  .addUserOption((o) =>
    o.setName('user2')
      .setDescription('Second user. If omitted, you are the challenger.')
      .setRequired(false),
  );
