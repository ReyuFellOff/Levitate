// xoxo/slashCommands/utility/react.ts
import { SlashCommandBuilder } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('react')
  .setDescription('React to a message with an emoji.')
  .addStringOption((o) =>
    o.setName('message_id')
      .setDescription('The ID of the message to react to.')
      .setRequired(true),
  )
  .addStringOption((o) =>
    o.setName('emoji')
      .setDescription('Unicode emoji, custom emoji name, or emoji ID to react with.')
      .setRequired(true),
  );
