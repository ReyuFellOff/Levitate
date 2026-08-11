// xoxo/commands/utility/snipe.ts
//
// Show the last deleted message in a channel.
// Usage: $snipe [#channel | channel id]

import type { LevitateClient } from '../../structures/LevitateClient.js';
import { sendError }            from '../../components/statusMessages.js';
import { getSnipes }            from '../../components/moderation/snipeStore.js';
import { buildSnipePayload }    from '../../components/moderation/snipe.js';

export const options = {
  name:        'snipe',
  aliases:     ['s'] as string[],
  description: 'Show the last deleted message in a channel.',
  usage:       'snipe [#channel]',
  category:    'utility',
  owner:       false,
  cooldown:    3,
};

export async function prefixExecute(
  message: any,
  args:    string[],
  client:  LevitateClient,
): Promise<any> {
  const ctx = { message };
  if (!message.guild) return sendError(ctx, 'This command can only be used in a server.');

  // Optionally resolve a different channel from the first arg
  let targetChannelId = message.channelId as string;

  const firstArg = args[0];
  if (firstArg) {
    const mentionId = firstArg.match(/^<#(\d+)>$/)?.[1];
    const rawId     = /^\d{17,20}$/.test(firstArg) ? firstArg : null;
    const resolvedId = mentionId ?? rawId;
    if (resolvedId) {
      const ch = message.guild.channels.cache.get(resolvedId);
      if (!ch) return sendError(ctx, `Could not find that channel in this server.`);
      targetChannelId = resolvedId;
    }
  }

  const last = getSnipes(targetChannelId)[0];
  if (!last) {
    return sendError(
      ctx,
      targetChannelId === message.channelId
        ? 'No recently deleted messages found in this channel.'
        : `No recently deleted messages found in <#${targetChannelId}>.`,
    );
  }

  return message.channel.send(buildSnipePayload(last, targetChannelId));
}
