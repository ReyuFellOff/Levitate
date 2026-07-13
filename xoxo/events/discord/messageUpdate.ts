// xoxo/events/discord/messageUpdate.ts
//
// Logging: fires when a message's content is edited. Ignores bot messages,
// DMs, and updates where the text content didn't actually change (e.g. an
// embed loading in after a link is posted).

import type { LevitateClient } from '../../structures/LevitateClient.js';
import { dispatchLog } from '../../helpers/logDispatcher.js';
import { buildMessageUpdatePayload } from '../../components/logging/logMessages.js';

export const name = 'messageUpdate';
export const once = false;

export async function execute(oldMessage: any, newMessage: any, client: LevitateClient): Promise<void> {
  if (!newMessage.guild) return;
  if (newMessage.author?.bot) return;
  if (oldMessage.content === newMessage.content) return;

  const channelId = newMessage.channelId ?? newMessage.channel?.id;
  if (!channelId) return;

  const payload = buildMessageUpdatePayload(oldMessage, newMessage);
  await dispatchLog(client, newMessage.guild.id, 'message', [channelId], payload);
}
