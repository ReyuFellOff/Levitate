import { SlashCommandBuilder } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('servervolume')
  .setDescription('Set or reset the persistent server-wide playback volume.')
  .addStringOption((o) =>
    o.setName('value').setDescription('Volume from 0 to 200, or reset.')
      .setRequired(true)
      .setMaxLength(5),
  );
