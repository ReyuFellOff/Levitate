import { PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('autonick')
  .setDescription('Configure text applied to new member and bot nicknames.')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageNicknames)
  .addSubcommand((sub) =>
    sub.setName('prepend')
      .setDescription('Add text before new member or bot names.')
      .addStringOption((option) => option.setName('type').setDescription('Who this applies to.')
        .addChoices({ name: 'Members', value: 'member' }, { name: 'Bots', value: 'bot' })
        .setRequired(true))
      .addStringOption((option) => option.setName('text').setDescription('Text to prepend.').setRequired(true)),
  )
  .addSubcommand((sub) =>
    sub.setName('append')
      .setDescription('Add text after new member or bot names.')
      .addStringOption((option) => option.setName('type').setDescription('Who this applies to.')
        .addChoices({ name: 'Members', value: 'member' }, { name: 'Bots', value: 'bot' })
        .setRequired(true))
      .addStringOption((option) => option.setName('text').setDescription('Text to append.').setRequired(true)),
  )
  .addSubcommand((sub) =>
    sub.setName('reset')
      .setDescription('Reset one or both autonick settings.')
      .addStringOption((option) => option.setName('target').setDescription('Setting to reset.')
        .addChoices(
          { name: 'All', value: 'all' },
          { name: 'Members', value: 'member' },
          { name: 'Bots', value: 'bot' },
        ).setRequired(false))
      .addStringOption((option) => option.setName('mode').setDescription('Which part to reset.')
        .addChoices(
          { name: 'All', value: 'all' },
          { name: 'Prepend', value: 'prepend' },
          { name: 'Append', value: 'append' },
        ).setRequired(false)),
  )
  .addSubcommand((sub) => sub.setName('status').setDescription('Show the current autonick settings.'));
