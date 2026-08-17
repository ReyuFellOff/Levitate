// xoxo/commands/customisation/namestyle.ts
//
// $namestyle / $ns — opens the single-page name-style form directly.
// The form is pre-populated with the guild's current style (if any).
//
// Requires: Manage Server (invoker)

import { PermissionFlagsBits } from 'discord.js';
import type { LevitateClient }  from '../../structures/LevitateClient.js';
import { sendError }            from '../../components/statusMessages.js';
import {
  buildFormPage,
  registerNsSession,
  type NsSession,
} from '../../components/utility/namestyle.js';
import {
  buildHomePage,
  registerCustomiseSession,
  resolveBotDisplayName,
  resolveBotAvatarUrl,
} from '../../components/customisation/customise.js';

export const options = {
  name:        'namestyle',
  aliases:     ['ns'] as string[],
  description: "Interactively set the bot's display name style for this server.",
  usage:       'namestyle',
  category:    'customisation',
  owner:       false,
  cooldown:    5,
};

export async function prefixExecute(
  message: any,
  _args:   string[],
  client:  LevitateClient,
): Promise<any> {
  const ctx = { message };

  if (!message.guild)
    return sendError(ctx, 'This command can only be used in a server.');

  if (!message.member?.permissions?.has?.(PermissionFlagsBits.ManageGuild))
    return sendError(ctx, 'You need the **Manage Server** permission to manage name styles.');

  if (!client.db)
    return sendError(ctx, 'Database is unavailable right now.');

  const scopeId   = message.id;
  const guildName = message.guild.name as string;
  const style     = await client.db.getNameStyle(message.guild.id).catch((): null => null);

  // Pre-populate session with existing style values so the form shows current data
  const session: NsSession = {
    guildId:   message.guild.id,
    guildName,
    authorId:  message.author.id,
    channelId: message.channel.id,
    botMsgId:  '', // filled after send
    client,
    fontId:    style?.font_id,
    effectId:  style?.effect_id,
    color1:    style?.colors?.[0],
    color2:    style?.colors?.[1],
    // Back always opens the customise home page
    backFn: async (backInteraction: any) => {
      const botDisplayName = await resolveBotDisplayName(client, message.guild.id);
      const avatarUrl      = await resolveBotAvatarUrl(client, message.guild.id);
      const customiseScopeId = session.botMsgId || scopeId;
      registerCustomiseSession(customiseScopeId, {
        guildId:   message.guild.id,
        guildName,
        authorId:  message.author.id,
        channelId: message.channel.id,
        botMsgId:  session.botMsgId,
        client,
        step:      'home',
      });
      await backInteraction.update(
        buildHomePage(customiseScopeId, guildName, botDisplayName, avatarUrl),
      ).catch((): null => null);
    },
  };

  const botMsg = await message.channel
    .send(buildFormPage(scopeId, session))
    .catch((): null => null);
  if (!botMsg) return;

  session.botMsgId = botMsg.id;
  registerNsSession(scopeId, session);
}

export async function slashExecute(interaction: any, client: LevitateClient): Promise<any> {
  await interaction.deferReply();

  if (!interaction.guild)
    return sendError({ interaction }, 'This command can only be used in a server.');

  if (!client.db)
    return sendError({ interaction }, 'Database is unavailable right now.');

  const scopeId   = interaction.id;
  const guildName = interaction.guild.name as string;
  const style     = await client.db.getNameStyle(interaction.guildId).catch((): null => null);

  const session: NsSession = {
    guildId:   interaction.guildId,
    guildName,
    authorId:  interaction.user.id,
    channelId: interaction.channelId,
    botMsgId:  '', // filled after editReply
    client,
    fontId:    style?.font_id,
    effectId:  style?.effect_id,
    color1:    style?.colors?.[0],
    color2:    style?.colors?.[1],
    // Back always opens the customise home page
    backFn: async (backInteraction: any) => {
      const botDisplayName = await resolveBotDisplayName(client, interaction.guildId);
      const avatarUrl      = await resolveBotAvatarUrl(client, interaction.guildId);
      const customiseScopeId = session.botMsgId || scopeId;
      registerCustomiseSession(customiseScopeId, {
        guildId:   interaction.guildId,
        guildName,
        authorId:  interaction.user.id,
        channelId: interaction.channelId,
        botMsgId:  session.botMsgId,
        client,
        step:      'home',
      });
      await backInteraction.update(
        buildHomePage(customiseScopeId, guildName, botDisplayName, avatarUrl),
      ).catch((): null => null);
    },
  };

  const msg = await interaction.editReply(buildFormPage(scopeId, session));

  session.botMsgId = msg.id;
  registerNsSession(scopeId, session);
}
