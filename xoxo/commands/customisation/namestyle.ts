// xoxo/commands/customisation/namestyle.ts
//
// $namestyle / $ns — interactive name-style wizard.
// Sends a single panel message and hands off to the component handler.
//
// Requires: Manage Server (invoker)

import { PermissionFlagsBits } from 'discord.js';
import type { LevitateClient }  from '../../structures/LevitateClient.js';
import { sendError }            from '../../components/statusMessages.js';
import {
  buildHomePage,
  registerNsSession,
} from '../../components/utility/namestyle.js';

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
  const style     = await client.db.getNameStyle(message.guild.id).catch((): null => null);
  const guildName = message.guild.name as string;

  const botMsg = await message.channel
    .send(buildHomePage(scopeId, style, guildName))
    .catch((): null => null);
  if (!botMsg) return;

  registerNsSession(scopeId, {
    guildId:   message.guild.id,
    guildName,
    authorId:  message.author.id,
    channelId: message.channel.id,
    botMsgId:  botMsg.id,
    client,
    step:      'home',
  });
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

  const msg = await interaction.editReply(buildHomePage(scopeId, style, guildName));

  registerNsSession(scopeId, {
    guildId:   interaction.guildId,
    guildName,
    authorId:  interaction.user.id,
    channelId: interaction.channelId,
    botMsgId:  msg.id,
    client,
    step:      'home',
  });
}
