// xoxo/events/discord/stickerCreate.ts
//
// Logging: fires when a sticker is added. Category: `server`,
// exception key: `sticker`.

import type { LevitateClient } from '../../structures/LevitateClient.js';
import { dispatchLog } from '../../helpers/logDispatcher.js';
import { buildStickerCreatePayload } from '../../components/logging/logMessages.js';

export const name = 'stickerCreate';
export const once = false;

export async function execute(sticker: any, client: LevitateClient): Promise<void> {
  if (!sticker.guild) return;
  const payload = buildStickerCreatePayload(sticker);
  await dispatchLog(client, sticker.guild.id, 'server', ['sticker'], payload);
}
