import { SlashCommandBuilder } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('volume')
  .setDescription('Set or view the playback volume.')
  .addIntegerOption((o) =>
    o.setName('volume').setDescription('Volume (1-100)').setRequired(false).setMinValue(1).setMaxValue(100),
  );
