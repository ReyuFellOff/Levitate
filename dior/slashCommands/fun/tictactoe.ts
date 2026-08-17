import { SlashCommandBuilder, ApplicationIntegrationType, InteractionContextType } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('tictactoe')
  .setDescription('Play tic tac toe against another member or the bot.')
  .addUserOption((o) =>
    o.setName('user')
      .setDescription('User to challenge. Leave blank to play against the bot.')
      .setRequired(false),
  )
  .setIntegrationTypes([ApplicationIntegrationType.GuildInstall, ApplicationIntegrationType.UserInstall])
  .setContexts([InteractionContextType.Guild, InteractionContextType.BotDM, InteractionContextType.PrivateChannel]);
