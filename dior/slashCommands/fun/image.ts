import { SlashCommandBuilder, ApplicationIntegrationType, InteractionContextType } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('image')
  .setDescription('Search for an image and browse results (strict safe-search enforced).')
  .addStringOption((o) =>
    o.setName('query')
      .setDescription('What to search for.')
      .setRequired(true)
      .setMaxLength(200),
  )
  .setIntegrationTypes([ApplicationIntegrationType.GuildInstall, ApplicationIntegrationType.UserInstall])
  .setContexts([InteractionContextType.Guild, InteractionContextType.BotDM, InteractionContextType.PrivateChannel]);
