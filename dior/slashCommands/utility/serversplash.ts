import { ApplicationIntegrationType, InteractionContextType, SlashCommandBuilder } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('serversplash')
  .setDescription("Show this server's invite splash image.")
  .setIntegrationTypes([ApplicationIntegrationType.GuildInstall])
  .setContexts([InteractionContextType.Guild]);
