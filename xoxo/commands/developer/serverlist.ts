// xoxo/commands/developer/serverlist.ts
//
// Developer-only command. Responds inline with a CV2 panel listing all servers
// the bot is in, with a dropdown to view detailed info for any selected server.

import type { LevitateClient } from '../../structures/LevitateClient.js';
import { sendError } from '../../components/statusMessages.js';
import {
  buildServerListPayload,
  registerServerListSession,
} from '../../components/serverlist.js';

export const options = {
  name: 'serverlist',
  aliases: ['servers', 'guildlist'] as string[],
  description: 'View all servers the bot is in with an interactive panel.',
  usage: 'serverlist',
  category: 'developer',
  owner: true,
  cooldown: 0,
};

export async function prefixExecute(message: any, _args: string[], client: LevitateClient) {
  const guilds = [...client.guilds.cache.values()].sort(
    (a, b) => (b.memberCount ?? 0) - (a.memberCount ?? 0),
  );

  if (!guilds.length) return sendError({ message }, 'Bot is not in any servers.');

  const guildIds = guilds.map(g => g.id);

  const payload = buildServerListPayload(guildIds, client, 0);
  const sent    = await message.channel.send(payload);

  registerServerListSession(sent.id, {
    userId:    message.author.id,
    channelId: message.channelId,
    guildIds,
    page:      0,
    client,
  });
}
