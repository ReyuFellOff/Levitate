import { SlashCommandBuilder, ApplicationIntegrationType, InteractionContextType } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('ship')
  .setDescription('Ship two users together and see their love compatibility.')
  .addUserOption((o) =>
    o.setName('user')
      .setDescription('First user to ship (defaults to yourself if omitted).')
      .setRequired(false),
  )
  .addUserOption((o) =>
    o.setName('user2')
      .setDescription('Second user to ship. If omitted, a random member is picked.')
      .setRequired(false),
  )
  .setIntegrationTypes([ApplicationIntegrationType.GuildInstall, ApplicationIntegrationType.UserInstall])
  .setContexts([InteractionContextType.Guild, InteractionContextType.BotDM, InteractionContextType.PrivateChannel]);
