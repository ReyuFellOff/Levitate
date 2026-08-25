// xoxo/events/discord/stickerDelete.ts
//
// Logging: fires when a sticker is removed. Category: `server`,
// exception key: `sticker`.

import type { CassieClient } from '../../structures/CassieClient.js';
import { dispatchLog } from '../../helpers/logDispatcher.js';
import { buildStickerDeletePayload } from '../../components/logging/logMessages.js';

export const name = 'stickerDelete';
export const once = false;

export async function execute(sticker: any, client: CassieClient): Promise<void> {
  if (!sticker.guild) return;
  const payload = buildStickerDeletePayload(sticker);
  await dispatchLog(client, sticker.guild.id, 'server', ['sticker'], payload);
}
