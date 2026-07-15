// xoxo/commands/security/automod.ts
//
// $automod — Configure automatic message moderation for this server.
// Opens an interactive CV2 panel. Requires Manage Server.

import { PermissionFlagsBits } from 'discord.js';
import type { LevitateClient } from '../../structures/LevitateClient.js';
import { sendError } from '../../components/statusMessages.js';
import {
  buildAutomodHomePayload,
  registerAutomodSession,
  type AutomodSession,
} from '../../components/automod/automodPanel.js';

export const options = {
  name:        'automod',
  aliases:     ['am', 'automoderation'] as string[],
  description: 'Configure automatic message moderation for this server.',
  usage:       'automod',
  category:    'security',
  owner:       false,
  cooldown:    3,
};

export async function prefixExecute(
  message: any,
  _args:   string[],
  client:  LevitateClient,
): Promise<any> {
  if (!message.guild) return;

  const member = message.guild.members.cache.get(message.author.id)
    ?? await message.guild.members.fetch(message.author.id).catch((): null => null);
  if (!member?.permissions.has(PermissionFlagsBits.ManageGuild)) {
    return sendError({ message }, 'You need **Manage Server** permission to configure AutoMod.');
  }

  if (!client.db) return sendError({ message }, 'Database unavailable.');

  const config = await client.db.getAutomodConfig(message.guild.id).catch((): null => null);
  if (!config) return sendError({ message }, 'Failed to load AutoMod config.');

  const prefix = await client.db.getGuildPrefix(message.guild.id).catch((): string => client.config.prefix) ?? client.config.prefix;
  const panel  = await message.channel.send(buildAutomodHomePayload(config, 'PLACEHOLDER'));
  const msgId  = panel.id;

  // Resend with correct msgId baked into customIds
  await panel.edit(buildAutomodHomePayload(config, msgId));

  const session: AutomodSession = {
    userId:    message.author.id,
    guildId:   message.guild.id,
    channelId: message.channel.id,
    page:      'home',
    draft:     {},
    client,
  };
  registerAutomodSession(msgId, session);
}

export async function slashExecute(interaction: any, client: LevitateClient): Promise<any> {
  return prefixExecute(
    {
      guild:   interaction.guild,
      author:  interaction.user,
      channel: interaction.channel,
      reply:   (p: any) => interaction.replied || interaction.deferred
        ? interaction.editReply(p)
        : interaction.reply(p),
    },
    [],
    client,
  );
}
