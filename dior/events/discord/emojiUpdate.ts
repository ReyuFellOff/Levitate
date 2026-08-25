// xoxo/events/discord/emojiUpdate.ts
//
// Logging: fires when a custom emoji is renamed. Category: `server`,
// exception key: `emoji`.

import type { CassieClient } from '../../structures/CassieClient.js';
import { dispatchLog } from '../../helpers/logDispatcher.js';
import { buildEmojiUpdatePayload } from '../../components/logging/logMessages.js';

export const name = 'emojiUpdate';
export const once = false;

export async function execute(oldEmoji: any, newEmoji: any, client: CassieClient): Promise<void> {
  if (!newEmoji.guild) return;
  if (oldEmoji.name === newEmoji.name) return;
  const payload = buildEmojiUpdatePayload(oldEmoji, newEmoji);
  await dispatchLog(client, newEmoji.guild.id, 'server', ['emoji'], payload);
}
