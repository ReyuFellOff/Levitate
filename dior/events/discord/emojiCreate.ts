// xoxo/events/discord/emojiCreate.ts
//
// Logging: fires when a custom emoji is added. Category: `server`,
// exception key: `emoji`.

import type { CassieClient } from '../../structures/CassieClient.js';
import { dispatchLog } from '../../helpers/logDispatcher.js';
import { buildEmojiCreatePayload } from '../../components/logging/logMessages.js';

export const name = 'emojiCreate';
export const once = false;

export async function execute(emoji: any, client: CassieClient): Promise<void> {
  if (!emoji.guild) return;
  const payload = buildEmojiCreatePayload(emoji);
  await dispatchLog(client, emoji.guild.id, 'server', ['emoji'], payload);
}
