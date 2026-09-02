import { SlashCommandBuilder } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('achievement')
  .setDescription('Create a Minecraft-style achievement image.')
  .addStringOption((o) =>
    o.setName('text')
      .setDescription('The achievement text.')
      .setMaxLength(200)
      .setRequired(true),
  );
