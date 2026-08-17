import { SlashCommandBuilder } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('servervolume')
  .setDescription('Set the persistent default volume for this server (requires Manage Guild).')
  .addIntegerOption((o) =>
    o.setName('volume').setDescription('Volume (1-100)').setRequired(false).setMinValue(1).setMaxValue(100),
  );
