// xoxo/events/discord/emojiDelete.ts
//
// Logging: fires when a custom emoji is removed. Category: `server`,
// exception key: `emoji`.

import { AuditLogEvent } from 'discord.js';
import type { LevitateClient } from '../../structures/LevitateClient.js';
import { dispatchLog, fetchAuditLogExecutor } from '../../helpers/logDispatcher.js';
import { buildEmojiDeletePayload } from '../../components/logging/logMessages.js';
import { checkAntinukeModule } from '../../helpers/antinukeEngine.js';

export const name = 'emojiDelete';
export const once = false;

export async function execute(emoji: any, client: LevitateClient): Promise<void> {
  if (!emoji.guild) return;
  const payload = buildEmojiDeletePayload(emoji);
  await dispatchLog(client, emoji.guild.id, 'server', ['emoji'], payload);

  const executor = await fetchAuditLogExecutor(emoji.guild, AuditLogEvent.EmojiDelete, emoji.id);
  await checkAntinukeModule({
    client,
    guild: emoji.guild,
    module: 'emojiDelete',
    executor,
    actionDescription: `deleted emoji :${emoji.name ?? emoji.id}:`,
  });
}
