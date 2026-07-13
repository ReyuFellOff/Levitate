// xoxo/commands/welcomer/greet-channel.ts
//
// $greet-channel — set or remove the welcome message channel for this server.
//
// Usage:
//   $greet-channel set <#channel | channel-id>
//   $greet-channel remove

import { ChannelType, PermissionFlagsBits } from 'discord.js';
import type { LevitateClient } from '../../structures/LevitateClient.js';
import { sendError, sendSuccess } from '../../components/statusMessages.js';

export const options = {
  name:        'greet-channel',
  aliases:     ['gc', 'greet-ch'] as string[],
  description: 'Set or remove the channel where welcome messages are sent.',
  usage: `greet-channel set <#channel | channel-id>
greet-channel remove`,
  category: 'welcomer',
  owner:    false,
  cooldown: 3,
};

function resolveTextChannel(guild: any, arg: string): any | null {
  const idMatch = arg.match(/^<#(\d+)>$/) ?? arg.match(/^(\d{17,20})$/);
  if (!idMatch) return null;
  const ch = guild.channels.cache.get(idMatch[1]);
  if (!ch) return null;
  return (
    ch.type === ChannelType.GuildText ||
    ch.type === ChannelType.GuildAnnouncement ||
    (ch.isTextBased?.() && !ch.isVoiceBased?.())
  ) ? ch : null;
}

export async function prefixExecute(
  message: any,
  args:    string[],
  client:  LevitateClient,
): Promise<any> {
  const ctx = { message };
  if (!message.guild) return sendError(ctx, 'This command can only be used in a server.');

  if (!message.channel.permissionsFor?.(message.member)?.has?.(PermissionFlagsBits.ManageGuild))
    return sendError(ctx, 'You need the **Manage Server** permission to use this command.');

  if (!client.db) return sendError(ctx, 'Database is unavailable.');

  const action = args[0]?.toLowerCase();

  if (action === 'set') {
    const raw = args[1];
    if (!raw) return sendError(ctx, `Provide a channel mention or ID.\n-# Example: \`${client.config.prefix}greet-channel set #welcome\``);

    const ch = resolveTextChannel(message.guild, raw);
    if (!ch) return sendError(ctx, 'Could not find a text channel with that mention or ID in this server.');

    await client.db.setGreetChannel(message.guild.id, ch.id);
    return sendSuccess(ctx, `Greet channel set to <#${ch.id}>. Members who join will be welcomed there.`);
  }

  if (action === 'remove') {
    await client.db.setGreetChannel(message.guild.id, null);
    return sendSuccess(ctx, 'Greet channel removed. Welcome messages will no longer be sent.');
  }

  return sendError(
    ctx,
    `**Usage:**\n\`${client.config.prefix}greet-channel set <#channel>\`\n\`${client.config.prefix}greet-channel remove\``,
  );
}
