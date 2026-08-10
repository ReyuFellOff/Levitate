// xoxo/commands/data/send-data.ts
//
// Browse saved data and send the selected item directly in this channel.
// Shows the same dropdown as $view-data, but on selection the dropdown
// message is deleted and the data is sent directly — no persistent panel.
// Requires Administrator permission.
//
// Interaction routing in interactionCreate.ts (customId prefix: 'senddata').
// Session tracking + payload builders in xoxo/components/sendDataMenu.ts.

import type { LevitateClient } from '../../structures/LevitateClient.js';
import { sendError } from '../../components/statusMessages.js';
import {
  buildSendDataPayload,
  registerSendDataSession,
} from '../../components/sendDataMenu.js';

export const options = {
  name: 'send-data',
  aliases: ['senddata', 'sdata'] as string[],
  description: 'Browse saved data and send the selected item directly in this channel.',
  usage: 'send-data',
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

  const payload = buildSendDataPayload(items, 0);

  const sentMsg = await (message.channel as any)
    .send(payload)
    .catch((): null => null);

  if (!sentMsg) {
    return sendError({ message }, 'Failed to send the send-data panel.');
  }

  registerSendDataSession(sentMsg.id, {
    userId:    message.author.id,
    guildId:   message.guild.id,
    channelId: message.channel.id,
    items,
    page:      0,
    client,
  });
}
