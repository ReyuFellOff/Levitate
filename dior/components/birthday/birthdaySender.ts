import { config } from '../../config.js';
// xoxo/components/birthday/birthdaySender.ts
//
// Shared birthday-message dispatcher. Sends the configured birthday message
// for a member to their server's configured birthday channel.
//
// Mirrors the welcomer's greetSender dispatch pattern (message_text + optional
// message_data merged into a single Discord message). Unlike greet, there is
// no "test" bypass logic needed here — birthdays don't skip bots because bots
// don't set birthdays.

import { MessageFlags } from 'discord.js';
import type { LevitateClient } from '../../structures/LevitateClient.js';
import { resolvePlaceholders, type PlaceholderContext } from '../../helpers/placeholders.js';
import webhookLogger from '../../utils/webhookLogger.js';

export const DEFAULT_BIRTHDAY_MESSAGE = 'Happy Birthday, ${user_mention}! Hope your day is amazing.';

export interface BirthdayResult {
  sent: boolean;
  reason?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Public entry point
// ─────────────────────────────────────────────────────────────────────────────

/** Dispatch the configured birthday message for `member` to their server. */
export async function sendBirthdayMessage(
  member: any,
  client: LevitateClient,
): Promise<BirthdayResult> {
  if (!client.db) return { sent: false, reason: 'Database is unavailable.' };

  const guild    = member.guild;
  const settings = await client.db.getBirthdaySettings(guild.id).catch((): null => null);

  if (!settings?.channel_id) {
    return { sent: false, reason: 'No birthday channel has been set. Use `birthday channel set <channel>`.' };
  }

  const birthdayChannel: any =
    guild.channels.cache.get(settings.channel_id) ??
    await client.channels.fetch(settings.channel_id).catch((): null => null);

  if (!birthdayChannel) {
    return { sent: false, reason: 'The configured birthday channel no longer exists.' };
  }

  const ctx: PlaceholderContext = {
    user:    member.user,
    member,
    channel: birthdayChannel,
    guild,
    client,
  };

  const messageText   = settings.message_text ?? DEFAULT_BIRTHDAY_MESSAGE;
  const resolvedText  = resolvePlaceholders(messageText, ctx);

  const delivered = settings.message_data
    ? await dispatchSavedData(settings.message_data, guild.id, birthdayChannel, ctx, client, resolvedText)
    : await birthdayChannel.send({
        content:         resolvedText,
        allowedMentions: { parse: ['users'] },
      }).then((): boolean => true).catch((err: unknown): boolean => {
        webhookLogger.logError(err instanceof Error ? err : new Error(String(err)), 'birthdaySender: plain text send');
        return false;
      });

  if (!delivered) {
    return { sent: false, reason: 'Failed to deliver the birthday message (missing permissions or broken saved data).' };
  }

  return { sent: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal: fetch a saved-data entry and send it (optionally merged with text)
// ─────────────────────────────────────────────────────────────────────────────

/** Returns true only if a message was actually delivered to `channel`. */
async function dispatchSavedData(
  dataName:    string,
  guildId:     string,
  channel:     any,
  ctx:         PlaceholderContext,
  client:      LevitateClient,
  prependText: string | null = null,
): Promise<boolean> {
  const entry = await client.db.getSavedData(guildId, dataName).catch((err: unknown): null => {
    webhookLogger.logError(err instanceof Error ? err : new Error(String(err)), 'birthdaySender: dispatchSavedData getSavedData lookup');
    return null;
  });
  if (!entry) {
    webhookLogger.logError(new Error(`birthdaySender: saved data "${dataName}" not found for guild ${guildId}`), 'birthdaySender: dispatchSavedData entry lookup');
    return false;
  }

  const storageChannelId: string = (client.config as any).savedDataChannelId ?? '';
  const storageChannel: any = storageChannelId
    ? (client.channels.cache.get(storageChannelId) ??
       await client.channels.fetch(storageChannelId).catch((err: unknown): null => {
         webhookLogger.logError(err instanceof Error ? err : new Error(String(err)), 'birthdaySender: dispatchSavedData storage channel fetch');
         return null;
       }))
    : null;
  if (!storageChannel) {
    webhookLogger.logError(new Error('birthdaySender: storage channel not configured or unreachable'), 'birthdaySender: dispatchSavedData storage channel lookup');
    return false;
  }

  const storageMsg: any = await storageChannel.messages
    .fetch(entry.message_id)
    .catch((err: unknown): null => {
      webhookLogger.logError(err instanceof Error ? err : new Error(String(err)), 'birthdaySender: dispatchSavedData storage message fetch');
      return null;
    });
  if (!storageMsg) {
    webhookLogger.logError(new Error(`birthdaySender: storage message ${entry.message_id} not found`), 'birthdaySender: dispatchSavedData storage message lookup');
    return false;
  }

  const fileAttachment = storageMsg.attachments?.first?.();
  if (!fileAttachment) {
    webhookLogger.logError(new Error(`birthdaySender: storage message ${entry.message_id} has no attachment`), 'birthdaySender: dispatchSavedData attachment lookup');
    return false;
  }

  let rawContent: string;
  try {
    const res = await fetch(fileAttachment.url);
    if (!res.ok) {
      webhookLogger.logError(new Error(`birthdaySender: saved-data fetch failed with status ${res.status}`), 'birthdaySender: dispatchSavedData fetch');
      return false;
    }
    rawContent = (await res.text()).trim();
  } catch (err) {
    webhookLogger.logError(err instanceof Error ? err : new Error(String(err)), 'birthdaySender: dispatchSavedData fetch');
    return false;
  }

  if (!rawContent) return false;

  const resolved = resolvePlaceholders(rawContent, ctx);

  // ── message type ──────────────────────────────────────────────────────────
  if (entry.type === 'message') {
    const combined = prependText ? `${prependText}\n${resolved}` : resolved;
    let remaining   = combined;
    let deliveredAny = false;
    while (remaining.length > 0) {
      const chunk = remaining.slice(0, 2000);
      remaining   = remaining.slice(2000);
      const ok = await channel.send({
        content:         chunk,
        allowedMentions: { parse: ['users'] },
      }).then((): boolean => true).catch((err: unknown): boolean => {
        webhookLogger.logError(err instanceof Error ? err : new Error(String(err)), 'birthdaySender: dispatchSavedData message send');
        return false;
      });
      deliveredAny = deliveredAny || ok;
    }
    return deliveredAny;
  }

  // ── embed type ────────────────────────────────────────────────────────────
  if (entry.type === 'embed') {
    try {
      const parsed = JSON.parse(resolved);
      const embeds = Array.isArray(parsed) ? parsed : (parsed?.embeds ?? [parsed]);
      const payload: any = { embeds, allowedMentions: { parse: ['users'] } };

      if (prependText) {
        payload.content = parsed?.content
          ? `${prependText}\n${parsed.content}`
          : prependText;
      } else if (parsed?.content) {
        payload.content = parsed.content;
      }

      return await channel.send(payload).then((): boolean => true).catch((err: unknown): boolean => {
        webhookLogger.logError(err instanceof Error ? err : new Error(String(err)), 'birthdaySender: dispatchSavedData embed send');
        return false;
      });
    } catch (err) {
      webhookLogger.logError(err instanceof Error ? err : new Error(String(err)), 'birthdaySender: dispatchSavedData embed parse');
      return false;
    }
  }

  // ── cv2 type ──────────────────────────────────────────────────────────────
  if (entry.type === 'cv2') {
    try {
      const parsed     = JSON.parse(resolved);
      const components = Array.isArray(parsed) ? parsed : [parsed];

      const finalComponents = prependText
        ? [{ type: 10, content: prependText }, ...components]
        : components;

      return await channel.send({
        components:      finalComponents,
        flags:           MessageFlags.IsComponentsV2,
        allowedMentions: { parse: ['users'] },
      }).then((): boolean => true).catch((err: unknown): boolean => {
        webhookLogger.logError(err instanceof Error ? err : new Error(String(err)), 'birthdaySender: dispatchSavedData cv2 send');
        return false;
      });
    } catch (err) {
      webhookLogger.logError(err instanceof Error ? err : new Error(String(err)), 'birthdaySender: dispatchSavedData cv2 parse');
      return false;
    }
  }

  return false;
}
