import { config } from '../../config.js';
// xoxo/components/welcomer/greetSender.ts
//
// Shared welcome-message dispatcher.
// Called by the guildMemberAdd event (real joins) and `greet test` (preview).
//
// When both message_text and message_data are configured, everything is merged
// into a single Discord message:
//   • embed  → text becomes the `content` field above the embed
//   • cv2    → text is prepended as a TextDisplay (type 10) component
//   • message→ texts are newline-joined into one content block

import { MessageFlags } from 'discord.js';
import type { CassieClient } from '../../structures/CassieClient.js';
import { resolvePlaceholders, type PlaceholderContext } from '../../helpers/placeholders.js';
import webhookLogger from '../../utils/webhookLogger.js';

export interface GreetResult {
  sent:    boolean;
  /** Populated when sent===false and the skip is noteworthy (e.g. for test command). */
  reason?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Public entry point
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Dispatch the configured welcome message for `member`.
 * Set `isTest = true` when called from `greet test` — bot-skip is bypassed and
 * the invoker's member is used as the "joining" member.
 */
export async function sendGreetMessage(
  member: any,
  client: CassieClient,
  isTest = false,
): Promise<GreetResult> {
  if (!client.db) return { sent: false, reason: 'Database is unavailable.' };

  const guild    = member.guild;
  const settings = await client.db.getGreetSettings(guild.id).catch((): null => null);

  if (!settings?.channel_id) {
    return { sent: false, reason: 'No greet channel has been set. Use `greet channel set <channel>`.' };
  }

  // Skip bots on real joins (not test) unless greet_bots is enabled
  if (!isTest && member.user?.bot && !settings.greet_bots) {
    return { sent: false };
  }

  if (!settings.message_text && !settings.message_data) {
    return { sent: false, reason: 'No greet message has been set. Use `greet message set <text>`.' };
  }

  // Resolve the channel
  const greetChannel: any =
    guild.channels.cache.get(settings.channel_id) ??
    await client.channels.fetch(settings.channel_id).catch((): null => null);

  if (!greetChannel) {
    return { sent: false, reason: 'The configured greet channel no longer exists.' };
  }

  const ctx: PlaceholderContext = {
    user:    member.user,
    member,
    channel: greetChannel,
    guild,
    client,
  };

  // Resolve the plain-text part (if any)
  const resolvedText: string | null = settings.message_text
    ? resolvePlaceholders(settings.message_text, ctx)
    : null;

  if (settings.message_data) {
    // Saved data present — merge the text into the same Discord message
    await dispatchSavedData(settings.message_data, guild.id, greetChannel, ctx, client, resolvedText);
  } else if (resolvedText) {
    // Text only — send as a plain content message
    await greetChannel.send({
      content:         resolvedText,
      allowedMentions: { parse: ['users'] },
    }).catch((err: unknown) => {
      webhookLogger.logError(err instanceof Error ? err : new Error(String(err)), 'greetSender: plain text send');
    });
  }

  return { sent: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal: fetch a saved-data entry and send it (optionally merged with text)
// ─────────────────────────────────────────────────────────────────────────────

async function dispatchSavedData(
  dataName:    string,
  guildId:     string,
  channel:     any,
  ctx:         PlaceholderContext,
  client:      CassieClient,
  prependText: string | null = null,
): Promise<void> {
  const entry = await client.db.getSavedData(guildId, dataName).catch((err: unknown): null => {
    webhookLogger.logError(err instanceof Error ? err : new Error(String(err)), 'greetSender: dispatchSavedData getSavedData lookup');
    return null;
  });
  if (!entry) {
    webhookLogger.logError(new Error(`greetSender: saved data "${dataName}" not found for guild ${guildId}`), 'greetSender: dispatchSavedData entry lookup');
    return;
  }

  const storageChannelId: string = (client.config as any).savedDataChannelId ?? '';
  const storageChannel: any = storageChannelId
    ? (client.channels.cache.get(storageChannelId) ??
       await client.channels.fetch(storageChannelId).catch((err: unknown): null => {
         webhookLogger.logError(err instanceof Error ? err : new Error(String(err)), 'greetSender: dispatchSavedData storage channel fetch');
         return null;
       }))
    : null;
  if (!storageChannel) {
    webhookLogger.logError(new Error('greetSender: storage channel not configured or unreachable'), 'greetSender: dispatchSavedData storage channel lookup');
    return;
  }

  const storageMsg: any = await storageChannel.messages
    .fetch(entry.message_id)
    .catch((err: unknown): null => {
      webhookLogger.logError(err instanceof Error ? err : new Error(String(err)), 'greetSender: dispatchSavedData storage message fetch');
      return null;
    });
  if (!storageMsg) {
    webhookLogger.logError(new Error(`greetSender: storage message ${entry.message_id} not found`), 'greetSender: dispatchSavedData storage message lookup');
    return;
  }

  const fileAttachment = storageMsg.attachments?.first?.();
  if (!fileAttachment) {
    webhookLogger.logError(new Error(`greetSender: storage message ${entry.message_id} has no attachment`), 'greetSender: dispatchSavedData attachment lookup');
    return;
  }

  let rawContent: string;
  try {
    const res = await fetch(fileAttachment.url);
    if (!res.ok) {
      webhookLogger.logError(new Error(`greetSender: saved-data fetch failed with status ${res.status}`), 'greetSender: dispatchSavedData fetch');
      return;
    }
    rawContent = (await res.text()).trim();
  } catch (err) {
    webhookLogger.logError(err instanceof Error ? err : new Error(String(err)), 'greetSender: dispatchSavedData fetch');
    return;
  }

  if (!rawContent) return;

  const resolved = resolvePlaceholders(rawContent, ctx);

  // ── message type ──────────────────────────────────────────────────────────
  if (entry.type === 'message') {
    // Join the greet text and the stored message text, then send in ≤2000-char chunks
    const combined = prependText ? `${prependText}\n${resolved}` : resolved;
    let remaining  = combined;
    while (remaining.length > 0) {
      const chunk = remaining.slice(0, 2000);
      remaining   = remaining.slice(2000);
      await channel.send({
        content:         chunk,
        allowedMentions: { parse: ['users'] },
      }).catch((err: unknown) => {
        webhookLogger.logError(err instanceof Error ? err : new Error(String(err)), 'greetSender: dispatchSavedData message send');
      });
    }
    return;
  }

  // ── embed type ────────────────────────────────────────────────────────────
  if (entry.type === 'embed') {
    try {
      const parsed = JSON.parse(resolved);
      const embeds = Array.isArray(parsed) ? parsed : (parsed?.embeds ?? [parsed]);
      const payload: any = { embeds, allowedMentions: { parse: ['users'] } };

      // Merge greet text with any content already baked into the embed JSON
      if (prependText) {
        payload.content = parsed?.content
          ? `${prependText}\n${parsed.content}`
          : prependText;
      } else if (parsed?.content) {
        payload.content = parsed.content;
      }

      await channel.send(payload).catch((err: unknown) => {
        webhookLogger.logError(err instanceof Error ? err : new Error(String(err)), 'greetSender: dispatchSavedData embed send');
      });
    } catch (err) {
      webhookLogger.logError(err instanceof Error ? err : new Error(String(err)), 'greetSender: dispatchSavedData embed parse');
      return;
    }
    return;
  }

  // ── cv2 type ──────────────────────────────────────────────────────────────
  if (entry.type === 'cv2') {
    try {
      const parsed     = JSON.parse(resolved);
      const components = Array.isArray(parsed) ? parsed : [parsed];

      // Prepend the greet text as a TextDisplay component (Discord type 10)
      // so both live in the same CV2 message
      const finalComponents = prependText
        ? [{ type: 10, content: prependText }, ...components]
        : components;

      await channel.send({
        components:      finalComponents,
        flags:           MessageFlags.IsComponentsV2,
        allowedMentions: { parse: ['users'] },
      }).catch((err: unknown) => {
        webhookLogger.logError(err instanceof Error ? err : new Error(String(err)), 'greetSender: dispatchSavedData cv2 send');
      });
    } catch (err) {
      webhookLogger.logError(err instanceof Error ? err : new Error(String(err)), 'greetSender: dispatchSavedData cv2 parse');
      return;
    }
  }
}
