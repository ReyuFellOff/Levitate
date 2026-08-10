// xoxo/slashCommands/utility/host-image.ts
//
// Slash command builder for /host-image.

import { SlashCommandBuilder, ApplicationIntegrationType, InteractionContextType } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('host-image')
  .setDescription('Upload an image to imgbb and get its hosted links.')
  .addAttachmentOption((o) =>
    o.setName('image')
      .setDescription('The image file to host.')
      .setRequired(false),
  )
  .addStringOption((o) =>
    o.setName('url')
      .setDescription('A direct image URL to host instead of an attachment.')
      .setRequired(false),
  )
  .setIntegrationTypes([ApplicationIntegrationType.GuildInstall, ApplicationIntegrationType.UserInstall])
  .setContexts([InteractionContextType.Guild, InteractionContextType.BotDM, InteractionContextType.PrivateChannel]);
