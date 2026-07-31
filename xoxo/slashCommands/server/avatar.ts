// xoxo/slashCommands/server/avatar.ts
import { SlashCommandBuilder, ApplicationIntegrationType, InteractionContextType } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('avatar')
  .setDescription("View an avatar.")
  .addSubcommand((sub) =>
    sub.setName('self').setDescription('View your own avatar.'),
  )
  .addSubcommand((sub) =>
    sub
      .setName('user')
      .setDescription("View another user's avatar.")
      .addUserOption((o) =>
        o.setName('user').setDescription('The user whose avatar to view.').setRequired(true),
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
