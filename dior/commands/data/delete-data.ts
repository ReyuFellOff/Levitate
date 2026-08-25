// xoxo/commands/data/delete-data.ts
//
// Delete a saved message/embed/CV2 entry for this server.
// Requires Administrator permission.
//
// Interaction routing in interactionCreate.ts (customId prefix: 'deldata').
// Session tracking + payload builders in xoxo/components/deleteDataMenu.ts.

import type { CassieClient } from '../../structures/CassieClient.js';
import { sendError } from '../../components/statusMessages.js';
import {
  buildDeleteDataPayload,
  registerDeleteDataSession,
} from '../../components/deleteDataMenu.js';

export const options = {
  name: 'delete-data',
  aliases: ['deletedata', 'ddata', 'deldata'] as string[],
  description: 'Delete a saved message/embed/CV2 entry for this server.',
  usage: 'delete-data',
  category: 'data',
  owner: false,
  cooldown: 0,
};

export async function prefixExecute(
  message: any,
  _args: string[],
  client: CassieClient,
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

  const payload = buildDeleteDataPayload(items, 0, 'select');

  const sentMsg = await (message.channel as any)
    .send(payload)
    .catch((): null => null);

  if (!sentMsg) {
    return sendError({ message }, 'Failed to send the delete panel.');
  }

  registerDeleteDataSession(sentMsg.id, {
    userId:    message.author.id,
    guildId:   message.guild.id,
    channelId: message.channel.id,
    items,
    page:      0,
    client,
  });
}
