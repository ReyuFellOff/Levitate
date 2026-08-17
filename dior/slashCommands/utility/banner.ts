// xoxo/slashCommands/utility/banner.ts
import { SlashCommandBuilder, ApplicationIntegrationType, InteractionContextType } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('banner')
  .setDescription("View a user's, the bot's, or the server's banner.")
  .addSubcommand((sub) =>
    sub
      .setName('user')
      .setDescription("View your own or another user's banner.")
      .addUserOption((o) =>
        o.setName('user')
          .setDescription('The user whose banner to view. Defaults to yourself.')
          .setRequired(false),
      ),
  )
  .addSubcommand((sub) =>
    sub.setName('bot').setDescription("View the bot's banner."),
  )
  .addSubcommand((sub) =>
    sub.setName('server').setDescription("View the server's banner."),
  )
  .setIntegrationTypes([ApplicationIntegrationType.GuildInstall, ApplicationIntegrationType.UserInstall])
  .setContexts([InteractionContextType.Guild, InteractionContextType.BotDM, InteractionContextType.PrivateChannel]);
