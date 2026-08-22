import { config } from '../config.js';
// xoxo/helpers/stickyHelper.ts
//
// Sticky-message engine.
//
// Strategy:
//   • One sticky per (guild, channel). Stored in `sticky_messages` collection.
//   • Payload is stored directly as a string in MongoDB so updateSticky needs no HTTP fetch.
//   • A copy of the payload is also uploaded as a file to `config.stickyDataChannelId`
//     whenever a sticky is set — for reference/archival.
//   • `client.stickyMessages` maps `"guildId-channelId"` → most-recently-sent
//     sticky message ID (loop guard).
//   • `updatingLocks` prevents re-entrancy on rapid message bursts.
//
// Caller flow:
//   messageCreate.ts → updateSticky(client, message)     [runs for every message]
//   sticky.ts        → setStickyAndPost(...)             [sticky set command]

import { AttachmentBuilder, MessageFlags } from 'discord.js';
import type { StickyDoc } from '../database/database.js';

const updatingLocks = new Set<string>();
const stickyCache = new Map<string, { expiresAt: number; data: StickyDoc | null }>();
const STICKY_CACHE_TTL_MS = 15_000;

export type StickyType = 'text' | 'cv2' | 'embed';

function stickyCacheKey(guildId: string, channelId: string): string {
  return `${guildId}-${channelId}`;
}

export function invalidateStickyCache(guildId: string, channelId: string): void {
  stickyCache.delete(stickyCacheKey(guildId, channelId));
}

// ─────────────────────────────────────────────────────────────────────────────
// Payload builder
// ─────────────────────────────────────────────────────────────────────────────

/** Build the discord.js send-payload for a sticky based on its type. */
export function buildStickyPayload(type: StickyType, payload: string): any {
  if (type === 'text') {
    return { content: payload, allowedMentions: { parse: [] } };
  }

  if (type === 'cv2') {
    const parsed = JSON.parse(payload);
    return {
      components:      Array.isArray(parsed) ? parsed : [parsed],
      flags:           MessageFlags.IsComponentsV2,
      allowedMentions: { parse: [] },
    };
  }

  // embed
  const parsed = JSON.parse(payload);
  if (Array.isArray(parsed)) return { embeds: parsed, allowedMentions: { parse: [] } };
  if (parsed && typeof parsed === 'object' && 'embeds' in parsed) {
    return { content: parsed.content ?? null, embeds: parsed.embeds ?? [], allowedMentions: { parse: [] } };
  }
  return { embeds: [parsed], allowedMentions: { parse: [] } };
}

// ─────────────────────────────────────────────────────────────────────────────
// Post helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Send the sticky into a channel and update DB + in-memory cache with the new ID.
 * Returns the sent message (or null on failure).
 */
export async function postStickyToChannel(
  client:    any,
  channel:   any,
  guildId:   string,
  channelId: string,
  type:      StickyType,
  payload:   string,
): Promise<any | null> {
  let sendPayload: any;
  try { sendPayload = buildStickyPayload(type, payload); }
  catch { return null; }

  const sent = await channel.send(sendPayload).catch((): null => null);
  if (!sent) return null;

  const key = `${guildId}-${channelId}`;
  client.stickyMessages.set(key, sent.id);
  await client.db.setStickyLastMessageId(guildId, channelId, sent.id).catch((): null => null);
  invalidateStickyCache(guildId, channelId);
  return sent;
}

/**
 * Persist a new sticky, archive the payload to the sticky data channel,
 * delete any old sticky message, and post the new one.
 * Used by `sticky set`.
 */
export async function setStickyAndPost(
  client:    any,
  channel:   any,
  guildId:   string,
  channelId: string,
  type:      StickyType,
  payload:   string,
): Promise<any | null> {
  // Remove any existing sticky message so the new one lands cleanly.
  const key = `${guildId}-${channelId}`;
  const prevId = client.stickyMessages.get(key);
  if (prevId) {
    const prev = await channel.messages.fetch(prevId).catch((): null => null);
    if (prev) await prev.delete().catch((): null => null);
    client.stickyMessages.delete(key);
  }

  // Persist payload to MongoDB (enables fast per-message reads).
  await client.db.setSticky(guildId, channelId, type, payload, null);
  invalidateStickyCache(guildId, channelId);

  // Archive a copy to the sticky data channel.
  uploadToStickyChannel(client, type, payload).catch((): null => null);

  // Post and update last_message_id.
  return postStickyToChannel(client, channel, guildId, channelId, type, payload);
}

// ─────────────────────────────────────────────────────────────────────────────
// Archive helper
// ─────────────────────────────────────────────────────────────────────────────

async function uploadToStickyChannel(client: any, type: StickyType, payload: string): Promise<void> {
  const stickyDataChannelId: string = (client.config as any).stickyDataChannelId ?? '';
  if (!stickyDataChannelId) return;

  const stickyDataChannel: any =
    client.channels.cache.get(stickyDataChannelId) ??
    await client.channels.fetch(stickyDataChannelId).catch((): null => null);
  if (!stickyDataChannel) return;

  const ext        = type === 'text' ? 'txt' : 'json';
  const attachment = new AttachmentBuilder(Buffer.from(payload, 'utf-8'), {
    name: `sticky-${type}.${ext}`,
  });
  await stickyDataChannel.send({ files: [attachment] }).catch((): null => null);

  const divider: string = (client.config as any).stickyDataDivider ?? '';
  if (divider) {
    await stickyDataChannel
      .send({ content: divider, allowedMentions: { parse: [] } })
      .catch((): null => null);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Update hook — called from messageCreate for every guild message
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Called for every guild message. Re-posts the sticky at the bottom of the
 * channel if there is one configured and enabled, unless the incoming message
 * IS the bot's own most recent sticky (loop guard).
 */
export async function updateSticky(client: any, message: any): Promise<void> {
  if (!message?.guild) return;

  const guildId   = message.guild.id;
  const channelId = message.channel?.id;
  if (!channelId) return;

  const key = `${guildId}-${channelId}`;

  // In-memory loop guard (fast path)
  const cachedLast = client.stickyMessages.get(key);
  if (cachedLast && cachedLast === message.id) return;

  if (updatingLocks.has(key)) return;
  updatingLocks.add(key);

  try {
    if (!client.db) return;

    const cached = stickyCache.get(key);
    const data = cached && cached.expiresAt > Date.now()
      ? cached.data
      : await client.db.getSticky(guildId, channelId).then((value: StickyDoc | null) => {
        stickyCache.set(key, { expiresAt: Date.now() + STICKY_CACHE_TTL_MS, data: value });
        return value;
      });
    if (!data || !data.enabled || !data.payload) return;

    // DB-backed loop guard (handles first message after restart)
    if (data.last_message_id && data.last_message_id === message.id) {
      client.stickyMessages.set(key, data.last_message_id);
      return;
    }

    // Delete prior sticky if we know about it.
    const prevId = client.stickyMessages.get(key) ?? data.last_message_id;
    if (prevId) {
      const prev = await message.channel.messages.fetch(prevId).catch((): null => null);
      if (prev) await prev.delete().catch((): null => null);
    }

    await postStickyToChannel(client, message.channel, guildId, channelId, data.type as StickyType, data.payload);
  } catch {
    // swallow — sticky errors must never crash messageCreate
  } finally {
    // Small debounce window coalesces rapid bursts.
    setTimeout(() => updatingLocks.delete(key), 200);
  }
}
