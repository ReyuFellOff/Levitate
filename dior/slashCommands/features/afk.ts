import { SlashCommandBuilder } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('afk')
  .setDescription('Set your AFK status. Automatically removed when you next send a message.')
  .addStringOption((o) =>
    o.setName('reason')
      .setDescription('Why you are going AFK. Supports custom emoji via {:emojiId:} syntax.')
      .setRequired(false)
      .setMaxLength(256),
  )
  .addAttachmentOption((o) =>
    o.setName('image')
      .setDescription('Optional image to attach to your AFK status.')
      .setRequired(false),
  );
