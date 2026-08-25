// xoxo/commands/utility/enlarge.ts
//
// Enlarge a custom Discord emoji — resolves from markdown, ID, or name and
// displays a full-size image via a CV2 MediaGallery.
//
// Prefix:  $enlarge <emoji | emoji ID | emoji name>
//
// Supports:
//   <:name:id>   animated <a:name:id>   raw numeric ID   :name:   bare name

import { MessageFlags } from 'discord.js';
import type { CassieClient } from '../../structures/CassieClient.js';
import { sendError } from '../../components/statusMessages.js';
import { sendWrongUsage } from '../../components/wrongUsage.js';
import { buildEnlargePayload } from '../../components/utility/enlarge.js';

export const options = {
  name:        'enlarge',
  aliases:     ['jumbo', 'big'] as string[],
  description: 'Show a custom emoji as a large image.',
  usage:       'enlarge <emoji | emoji ID | :name:>',
  category:    'miscellaneous',
  owner:       false,
  cooldown:    3,
  noTyping:    true,
};

// ─── Parsing helpers ──────────────────────────────────────────────────────────

interface ParsedEmoji {
  id:       string;
  name:     string;
  animated: boolean;
}

function parseArg(raw: string): ParsedEmoji | null {
  // Full markdown: <a:name:id> or <:name:id>
  const md = raw.match(/^<(a?):(\w+):(\d{17,20})>$/);
  if (md) return { animated: md[1] === 'a', name: md[2], id: md[3] };

  // Bare ID
  if (/^\d{17,20}$/.test(raw)) return { id: raw, name: '', animated: false };

  // :name: or bare name
  const name = raw.replace(/^:(.+):$/, '$1').trim();
  if (/^\w+$/.test(name)) return { id: '', name, animated: false };

  return null;
}

function emojiCdnUrl(id: string, animated: boolean): string {
  return `https://cdn.discordapp.com/emojis/${id}.${animated ? 'gif' : 'png'}?size=4096`;
}

// ─── Prefix execute ───────────────────────────────────────────────────────────

export async function prefixExecute(
  message: any,
  args:    string[],
  client:  CassieClient,
): Promise<any> {
  const ctx = { message };

  if (!args.length) {
    return sendWrongUsage(ctx, options.name, options.usage);
  }

  const parsed = parseArg(args[0]);
  if (!parsed) {
    return sendError(ctx, 'Please provide a valid emoji, emoji ID, or emoji name.');
  }

  // ── Resolve emoji from the cache / guilds ──────────────────────────────────
  let resolvedId       = parsed.id;
  let resolvedName     = parsed.name;
  let resolvedAnimated = parsed.animated;

  if (resolvedId) {
    // We already have the ID — just look it up to confirm it's accessible
    // and fill in animated/name if missing
    const found = client.emojis.cache.get(resolvedId);
    if (found) {
      resolvedName     = found.name ?? resolvedName;
      resolvedAnimated = found.animated ?? resolvedAnimated;
    }
    // Even if not in cache, the CDN URL is still valid for any public emoji
  } else {
    // Resolve by name: guild first, then full client cache
    const nameLower = resolvedName.toLowerCase();
    let found: any = null;

    if (message.guild) {
      found = message.guild.emojis.cache.find(
        (e: any) => e.name?.toLowerCase() === nameLower,
      );
    }
    if (!found) {
      found = client.emojis.cache.find(
        (e: any) => e.name?.toLowerCase() === nameLower,
      );
    }

    if (!found) {
      return sendError(
        ctx,
        `I couldn't find an emoji named **${resolvedName}** that I have access to.`,
      );
    }

    resolvedId       = found.id;
    resolvedName     = found.name ?? resolvedName;
    resolvedAnimated = found.animated ?? false;
  }

  const imageUrl  = emojiCdnUrl(resolvedId, resolvedAnimated);
  // Label rendered inline in the heading — Discord renders custom emoji markdown in CV2 text
  const emojiLabel = resolvedName
    ? `<${resolvedAnimated ? 'a' : ''}:${resolvedName}:${resolvedId}>`
    : `\`${resolvedId}\``;

  const payload = buildEnlargePayload(emojiLabel, imageUrl);

  return message.channel.send(payload);
}
