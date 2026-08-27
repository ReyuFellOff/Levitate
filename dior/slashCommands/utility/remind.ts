import { SlashCommandBuilder } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('remind')
  .setDescription('Create and manage personal reminders.')
  .addSubcommand((sub) => sub
    .setName('create')
    .setDescription('Create a reminder.')
    .addStringOption((option) => option
      .setName('duration')
      .setDescription('Duration, for example 10m or 1h30m.')
      .setRequired(true))
    .addStringOption((option) => option
      .setName('reason')
      .setDescription('What should you be reminded about?')
      .setRequired(false)))
  .addSubcommand((sub) => sub
    .setName('list')
    .setDescription('Show your active reminders.'))
  .addSubcommand((sub) => sub
    .setName('delete')
    .setDescription('Delete one of your reminders.')
    .addIntegerOption((option) => option
      .setName('number')
      .setDescription('Reminder number from remind list.')
      .setMinValue(1)
      .setRequired(true)));
