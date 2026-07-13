// xoxo/events/discord/messageDeleteBulk.ts
//
// Logging: fires when messages are bulk-deleted (e.g. via $purge).

import type { LevitateClient } from '../../structures/LevitateClient.js';
import { dispatchLog } from '../../helpers/logDispatcher.js';
import { buildMessageBulkDeletePayload } from '../../components/logging/logMessages.js';

export const name = 'messageDeleteBulk';
export const once = false;

export async function execute(messages: any, channel: any, client: LevitateClient): Promise<void> {
  const targetChannel = channel ?? messages.first()?.channel;
  if (!targetChannel?.guild) return;

  const payload = buildMessageBulkDeletePayload(targetChannel, messages.size ?? messages.length ?? 0);
  await dispatchLog(client, targetChannel.guild.id, 'message', [targetChannel.id], payload);
}
