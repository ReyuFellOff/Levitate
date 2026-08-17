// xoxo/events/discord/stickerUpdate.ts
//
// Logging: fires when a sticker is updated. Category: `server`,
// exception key: `sticker`.

import type { LevitateClient } from '../../structures/LevitateClient.js';
import { dispatchLog } from '../../helpers/logDispatcher.js';
import { buildStickerUpdatePayload } from '../../components/logging/logMessages.js';

export const name = 'stickerUpdate';
export const once = false;

export async function execute(oldSticker: any, newSticker: any, client: LevitateClient): Promise<void> {
  if (!newSticker.guild) return;
  if (oldSticker.name === newSticker.name) return;
  const payload = buildStickerUpdatePayload(oldSticker, newSticker);
  await dispatchLog(client, newSticker.guild.id, 'server', ['sticker'], payload);
}
