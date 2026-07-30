import { SlashCommandBuilder, ApplicationIntegrationType, InteractionContextType } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('vanity')
  .setDescription("Look up a Discord vanity URL — see who owns it or check if it's available.")
  .addStringOption((o) =>
    o.setName('code')
      .setDescription('The vanity code or full discord.gg link to look up.')
      .setRequired(true)
      .setMaxLength(64),
  )
  .setIntegrationTypes([ApplicationIntegrationType.GuildInstall, ApplicationIntegrationType.UserInstall])
  .setContexts([InteractionContextType.Guild, InteractionContextType.BotDM, InteractionContextType.PrivateChannel]);
