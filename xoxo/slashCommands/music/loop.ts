import { SlashCommandBuilder } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('loop')
  .setDescription('Toggle loop mode (none → track → queue → none).')
  .addStringOption((o) =>
    o.setName('mode')
      .setDescription('Loop mode')
      .setRequired(false)
      .addChoices(
        { name: 'None', value: 'none' },
        { name: 'Track', value: 'track' },
        { name: 'Queue', value: 'queue' },
      ),
  );
