import { SlashCommandBuilder, ApplicationIntegrationType, InteractionContextType } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('howautistic')
  .setDescription('See how autistic someone is.')
  .addUserOption((o) =>
    o.setName('user')
      .setDescription('The user to rate. Defaults to yourself.')
      .setRequired(false),
  )
  .setIntegrationTypes([ApplicationIntegrationType.GuildInstall, ApplicationIntegrationType.UserInstall])
  .setContexts([InteractionContextType.Guild, InteractionContextType.BotDM, InteractionContextType.PrivateChannel]);
