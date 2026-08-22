import { ApplicationIntegrationType, InteractionContextType, SlashCommandBuilder } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('servericon')
  .setDescription("Show this server's icon.")
  .setIntegrationTypes([ApplicationIntegrationType.GuildInstall])
  .setContexts([InteractionContextType.Guild]);
