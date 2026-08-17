// xoxo/commands/data/view-data.ts
//
// Browse and send saved message/embed/CV2 data for this server.
// Requires Administrator permission.
//
// Interaction routing lives in interactionCreate.ts (customId prefix: 'viewdata').
// Session tracking + payload builders live in xoxo/components/viewDataMenu.ts.

import type { LevitateClient } from '../../structures/LevitateClient.js';
import { sendError } from '../../components/statusMessages.js';
import {
  buildViewDataPayload,
  registerViewDataSession,
} from '../../components/viewDataMenu.js';

export const options = {
  name: 'view-data',
  aliases: ['viewdata', 'vdata'] as string[],
  description: 'Browse and send saved message/embed/CV2 data for this server.',
  usage: 'view-data',
  category: 'data',
  owner: false,
  cooldown: 0,
};

export async function prefixExecute(
  message: any,
  _args: string[],
  client: LevitateClient,
): Promise<any> {
  if (!message.guild) {
    return sendError({ message }, 'This command can only be used in a server.');
  }

  const authorPerms = message.channel.permissionsFor?.(message.member);
  if (!authorPerms?.has?.('Administrator')) {
    return sendError({ message }, 'You need the **Administrator** permission to use this command.');
  }

  if (!client.db) {
    return sendError({ message }, 'Database is unavailable.');
  }

  const items = await client.db.listSavedData(message.guild.id).catch((): null => null);

  if (!items) {
    return sendError({ message }, 'Failed to load saved data from the database.');
  }

  if (items.length === 0) {
    return sendError(
      { message },
      `No saved data found for this server. Use \`${client.config.prefix}create-data\` to save some.`,
    );
  }

  const payload = buildViewDataPayload(items, 0);

  const sentMsg = await (message.channel as any)
    .send(payload)
    .catch((): null => null);

  if (!sentMsg) {
    return sendError({ message }, 'Failed to send the saved data panel.');
  }

  registerViewDataSession(sentMsg.id, {
    userId:    message.author.id,
    guildId:   message.guild.id,
    channelId: message.channel.id,
    items,
    page:      0,
    client,
  });
}
