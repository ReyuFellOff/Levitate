import { SlashCommandBuilder } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('seek')
  .setDescription('Seek to a position in the current track.')
  .addStringOption((o) =>
    o.setName('time').setDescription('Time (e.g. 1:30, 1m 30s, 90)').setRequired(true),
  );
