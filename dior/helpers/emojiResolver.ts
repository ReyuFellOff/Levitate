// xoxo/helpers/emojiResolver.ts
import type { CassieClient } from '../structures/CassieClient.js';

/**
 * Resolve a Discord emoji by name or ID.
 *
 * Resolution order:
 * 1. Unicode emoji sequence       → return unchanged for message reactions
 * 2. Full custom-emoji markdown   <a?:name:id>  → resolve by extracted ID
 * 3. Pure numeric string          → resolve by ID
 * 4. Name string                  → current guild → client cache → fetch every guild
 */
export async function resolveEmoji(
  client: CassieClient,
  identifier: string,
  guild?: any,
): Promise<any | null> {
  const trimmed = identifier.trim();
  if (!trimmed) return null;

  if (isUnicodeEmoji(trimmed)) return trimmed;

  const colonMatch = trimmed.match(/^:([A-Za-z0-9_\-]+):$/);
  if (colonMatch) return resolveByName(client, colonMatch[1].toLowerCase(), guild);

  const markdownMatch = trimmed.match(/^<a?:[\w]+:(\d+)>$/);
  if (markdownMatch) return resolveById(client, markdownMatch[1]);

  if (/^\d+$/.test(trimmed)) return resolveById(client, trimmed);

  return resolveByName(client, trimmed.toLowerCase(), guild);
}

/**
 * Discord accepts Unicode emoji as the raw reaction string. Keep this
 * deliberately strict so ordinary text such as "hello⭐" does not bypass
 * custom emoji resolution and get passed to Discord as an invalid emoji.
 */
function isUnicodeEmoji(value: string): boolean {
  const emojiAtom = String.raw`(?:[\p{Extended_Pictographic}\p{Emoji_Presentation}]\uFE0F?\p{Emoji_Modifier}?)`;
  const zwjSequence = new RegExp(
    String.raw`^(?:\p{Regional_Indicator}{2}|(?:${emojiAtom})(?:\u200D(?:${emojiAtom}))*)$`,
    'u',
  );
  const keycap = /^(?:[0-9#*])\uFE0F?\u20E3$/u;
  return zwjSequence.test(value) || keycap.test(value);
}

async function resolveById(client: CassieClient, id: string): Promise<any | null> {
  const cached = client.emojis.cache.get(id);
  if (cached) return cached;

  for (const g of client.guilds.cache.values()) {
    const fetched = await g.emojis.fetch(id).catch((): null => null);
    if (fetched) return fetched;
  }
  return null;
}

async function resolveByName(
  client: CassieClient,
  nameLower: string,
  guild?: any,
): Promise<any | null> {
  if (guild?.emojis?.fetch) {
    const fetched = await guild.emojis.fetch().catch((): null => null);
    const found = fetched?.find((e: any) => e.name?.toLowerCase() === nameLower);
    if (found) return found;
  }

  if (guild) {
    const found = guild.emojis.cache.find((e: any) => e.name?.toLowerCase() === nameLower);
    if (found) return found;
  }

  const fromCache = client.emojis.cache.find((e: any) => e.name?.toLowerCase() === nameLower);
  if (fromCache) return fromCache;

  for (const g of client.guilds.cache.values()) {
    await g.emojis.fetch().catch(() => {});
    const found = g.emojis.cache.find((e: any) => e.name?.toLowerCase() === nameLower);
    if (found) return found;
  }
  return null;
}
