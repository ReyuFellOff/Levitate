// xoxo/events/discord/messageDelete.ts
//
// Logging: fires when a single message is deleted. Ignores bot messages and
// DMs. Partial messages (uncached) still log with whatever data is available.

import type { CassieClient } from '../../structures/CassieClient.js';
import { dispatchLog } from '../../helpers/logDispatcher.js';
import { buildMessageDeletePayload } from '../../components/logging/logMessages.js';
import { pushSnipe } from '../../components/moderation/snipeStore.js';
import { handleStarboardSourceDelete } from '../../helpers/starboard.js';
import { restoreHoneypotWarning } from '../../components/features/honeypot.js';
import {
  findVoiceMasterDeletionExecutor,
  isVoiceMasterControlMessage,
  restoreVoiceMasterPanel,
} from '../../helpers/voiceMaster.js';

export const name = 'messageDelete';
export const once = false;

export async function execute(message: any, client: CassieClient): Promise<void> {
  if (!message.guild) return;

  const channelId = message.channelId ?? message.channel?.id;
  const messageId = message.id;
  if (channelId && messageId) await restoreHoneypotWarning(client, message.guild.id, messageId);
  if (channelId && messageId && await isVoiceMasterControlMessage(client, message.guild.id, channelId, messageId)) {
    const deleter = await findVoiceMasterDeletionExecutor(
      message.guild,
      channelId,
      message.author?.id,
    );
    await restoreVoiceMasterPanel(client, message.guild, message.channel, deleter);
    return;
  }

  handleStarboardSourceDelete(message, client).catch((error: unknown) => {
    console.error(`[starboard] Failed to remove deleted source: ${error instanceof Error ? error.message : String(error)}`);
  });
  if (message.author?.bot) return;

  if (!channelId) return;

  // ── Snipe cache ─────────────────────────────────────────────────────────────
  // Only cache if we have at least some content or attachments (partial messages
  // with no data aren't useful to snipe).
  const content = message.content ?? '';
  const attachmentUrls: string[] = message.attachments
    ? [...message.attachments.values()].map((a: any) => a.url).filter(Boolean)
    : [];

  if (content || attachmentUrls.length || message.stickers?.size || message.embeds?.length) {
    const author = message.author;
    pushSnipe(channelId, {
      authorId:     author?.id   ?? 'unknown',
      authorName:   author?.globalName ?? author?.username ?? 'Unknown User',
      authorAvatar: author?.displayAvatarURL?.({ size: 256 }) ?? null,
      content,
      attachments:  attachmentUrls,
      embedCount:   message.embeds?.length ?? 0,
      sticker:      message.stickers?.first()?.name ?? null,
      replyTo:      message.reference?.messageId ?? null,
      createdAt:    message.createdTimestamp ?? Date.now(),
      deletedAt:    Date.now(),
      channelId,
      guildId:      message.guild.id,
    });
  }

  const payload = buildMessageDeletePayload(message);
  await dispatchLog(client, message.guild.id, 'message', [channelId], payload);
}
