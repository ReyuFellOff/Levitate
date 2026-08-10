import { SlashCommandBuilder, ApplicationIntegrationType, InteractionContextType } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('howrizz')
  .setDescription('See how much rizz someone has.')
  .addUserOption((o) =>
    o.setName('user')
      .setDescription('The user to rate. Defaults to yourself.')
      .setRequired(false),
  )
  .setIntegrationTypes([ApplicationIntegrationType.GuildInstall, ApplicationIntegrationType.UserInstall])
  .setContexts([InteractionContextType.Guild, InteractionContextType.BotDM, InteractionContextType.PrivateChannel]);
