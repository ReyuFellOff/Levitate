import { SlashCommandBuilder, ApplicationIntegrationType, InteractionContextType } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('vanity')
  .setDescription("Look up a Discord vanity URL, or show this server's vanity when no code is provided.")
  .addStringOption((o) =>
    o.setName('code')
      .setDescription('The vanity code or full discord.gg link to look up.')
      .setRequired(false)
      .setMaxLength(64),
  )
  .setIntegrationTypes([ApplicationIntegrationType.GuildInstall, ApplicationIntegrationType.UserInstall])
  .setContexts([InteractionContextType.Guild, InteractionContextType.BotDM, InteractionContextType.PrivateChannel]);
