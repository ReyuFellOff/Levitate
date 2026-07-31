// xoxo/slashCommands/server/avatar.ts
import { SlashCommandBuilder, ApplicationIntegrationType, InteractionContextType } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('avatar')
  .setDescription("View a user's, the bot's, or the server's avatar.")
  .addSubcommand((sub) =>
    sub
      .setName('user')
      .setDescription("View your own or another user's avatar.")
      .addUserOption((o) =>
        o.setName('user')
          .setDescription('The user whose avatar to view. Defaults to yourself.')
          .setRequired(false),
      ),
  )
  .addSubcommand((sub) =>
    sub.setName('bot').setDescription("View the bot's avatar."),
  )
  .addSubcommand((sub) =>
    sub.setName('server').setDescription("View the server's icon."),
  )
  .setIntegrationTypes([ApplicationIntegrationType.GuildInstall, ApplicationIntegrationType.UserInstall])
  .setContexts([InteractionContextType.Guild, InteractionContextType.BotDM, InteractionContextType.PrivateChannel]);
