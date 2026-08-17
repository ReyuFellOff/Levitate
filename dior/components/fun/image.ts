// xoxo/components/fun/image.ts
//
// CV2 payload builders + session manager for the $image command.
//
// Sessions are keyed by the bot's message ID. All button interactions are
// routed through the global interactionCreate handler (no message collectors).
// Session timeout: 3 minutes of inactivity → components disabled.

import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  MessageFlags,
  SeparatorBuilder,
  TextDisplayBuilder,
} from 'discord.js';
import { emojis } from '../../emojis.js';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ImageResult {
  imageUrl: string;
  title:    string;
  source:   string;
}

export interface ImageSession {
  results:   ImageResult[];
  index:     number;
  query:     string;
  authorId:  string;
  channelId: string;
  msgId:     string;  // bot message ID — set after send
  client:    any;
}

// ── Session store ─────────────────────────────────────────────────────────────

const TIMEOUT_MS = 3 * 60_000; // 3 minutes

const sessions  = new Map<string, ImageSession>();
const timeouts  = new Map<string, NodeJS.Timeout>();

export function registerImageSession(msgId: string, session: ImageSession): void {
  sessions.set(msgId, session);
  _scheduleTimeout(msgId);
}

export function getImageSession(msgId: string): ImageSession | undefined {
  return sessions.get(msgId);
}

export function clearImageSession(msgId: string): void {
  clearTimeout(timeouts.get(msgId));
  sessions.delete(msgId);
  timeouts.delete(msgId);
}

export function resetImageTimeout(msgId: string): void {
  clearTimeout(timeouts.get(msgId));
  _scheduleTimeout(msgId);
}

function _scheduleTimeout(msgId: string): void {
  timeouts.set(msgId, setTimeout(async () => {
    const s = sessions.get(msgId);
    sessions.delete(msgId);
    timeouts.delete(msgId);
    if (!s) return;

    try {
      const ch  = await (s.client as any).channels.fetch(s.channelId).catch((): null => null);
      if (!ch) return;
      const msg = await ch.messages.fetch(s.msgId).catch((): null => null);
      if (!msg) return;
      await msg.edit(buildImagePayload(s, true)).catch((): null => null);
    } catch { /* message may have been deleted */ }
  }, TIMEOUT_MS));
}

// ── customId helpers ──────────────────────────────────────────────────────────

export function makeImageId(action: 'prev' | 'next' | 'noop', msgId: string): string {
  return `image:${action}:${msgId}`;
}

export function parseImageId(customId: string): { action: string; msgId: string } | null {
  const parts = customId.split(':');
  if (parts.length < 3 || parts[0] !== 'image') return null;
  const action = parts[1];
  const msgId  = parts.slice(2).join(':');
  return { action, msgId };
}

// ── Image search (Bing Images scrape) ────────────────────────────────────────

const BING_IMAGES = 'https://www.bing.com/images/async';
const MAX_RESULTS = 8;

const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

interface BingImageBlob {
  murl?: string;
  purl?: string;
  t?:    string;
}

/**
 * Parse Bing's async image results page and extract image metadata.
 * Each result is embedded as a JSON blob in a `m="..."` attribute with
 * HTML-entity-encoded inner quotes. Fields used: murl (direct image URL),
 * purl (source page URL), t (title).
 */
function parseBingImages(html: string): BingImageBlob[] {
  // Each image block: m="{&quot;...&quot;}" → outer quotes literal, inner encoded
  const re   = /m="(\{[^"]*\})"/g;
  const out: BingImageBlob[] = [];
  let match: RegExpExecArray | null;

  while ((match = re.exec(html)) !== null) {
    try {
      const decoded = match[1]
        .replace(/&quot;/g, '"')
        .replace(/&amp;/g,  '&');
      const obj: BingImageBlob = JSON.parse(decoded);
      if (obj.murl) out.push(obj);
    } catch {
      // skip malformed blobs
    }
  }

  return out;
}

/**
 * Search Bing Images with strict safe-search enforced.
 * Returns up to MAX_RESULTS results or throws on failure.
 * No API key required.
 */
export async function searchImages(query: string): Promise<ImageResult[]> {
  const encodedQ = encodeURIComponent(query);

  const res = await fetch(
    `${BING_IMAGES}?q=${encodedQ}&first=1&count=20&adlt=strict`,
    {
      headers: {
        'User-Agent':     BROWSER_UA,
        'Accept':         'text/html,application/xhtml+xml',
        'Accept-Language':'en-US,en;q=0.9',
        'Referer':        `https://www.bing.com/images/search?q=${encodedQ}`,
      },
    },
  );

  if (!res.ok) throw new Error(`Bing image request failed (${res.status})`);

  const html  = await res.text();
  const blobs = parseBingImages(html);

  // Filter to displayable images (https preferred, no gifs)
  const filtered = blobs.filter(b => {
    const url = b.murl ?? '';
    return (
      (url.startsWith('http://') || url.startsWith('https://')) &&
      !url.toLowerCase().endsWith('.gif')
    );
  });

  if (!filtered.length) throw new Error('No image results returned by Bing');

  return filtered.slice(0, MAX_RESULTS).map(b => ({
    imageUrl: b.murl!,
    title:    b.t?.trim() || query,
    source:   b.purl ?? '',
  }));
}

// ── CV2 payload builders ──────────────────────────────────────────────────────

export function buildImagePayload(session: ImageSession, disabled = false): any {
  const { results, index, query } = session;
  const current = results[index];
  const total   = results.length;
  const hasPrev = index > 0;
  const hasNext = index < total - 1;
  const msgId   = session.msgId;

  const container = new ContainerBuilder();

  // Header line
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `${emojis.blackCards} **Image Search** — \`${query}\`\n` +
      `${emojis.whiteArrow2} Result **${index + 1}** of **${total}**`,
    ),
  );

  container.addSeparatorComponents(new SeparatorBuilder().setDivider(true));

  // Image gallery
  container.addMediaGalleryComponents(
    new MediaGalleryBuilder().addItems(
      new MediaGalleryItemBuilder()
        .setURL(current.imageUrl)
        .setDescription(current.title.slice(0, 100)),
    ),
  );

  // Source line (if available)
  if (current.source) {
    const display = current.source.length > 60
      ? current.source.slice(0, 57) + '…'
      : current.source;
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`-# ${display}`),
    );
  }

  container.addSeparatorComponents(new SeparatorBuilder().setDivider(false));

  // Navigation buttons
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(disabled ? makeImageId('noop', msgId) : makeImageId('prev', msgId))
      .setLabel('← Prev')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(disabled || !hasPrev),

    new ButtonBuilder()
      .setCustomId(`image:noop:${msgId}`)
      .setLabel(`${index + 1} / ${total}`)
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(true),

    new ButtonBuilder()
      .setCustomId(disabled ? makeImageId('noop', msgId) : makeImageId('next', msgId))
      .setLabel('Next →')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(disabled || !hasNext),
  );

  container.addActionRowComponents(row as any);

  return {
    components: [container],
    flags: MessageFlags.IsComponentsV2,
  };
}

/** Payload shown when there is only a single result (no navigation needed). */
export function buildSingleImagePayload(result: ImageResult, query: string): any {
  const container = new ContainerBuilder();

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `${emojis.blackCards} **Image Search** — \`${query}\``,
    ),
  );

  container.addSeparatorComponents(new SeparatorBuilder().setDivider(true));

  container.addMediaGalleryComponents(
    new MediaGalleryBuilder().addItems(
      new MediaGalleryItemBuilder()
        .setURL(result.imageUrl)
        .setDescription(result.title.slice(0, 100)),
    ),
  );

  if (result.source) {
    const display = result.source.length > 60
      ? result.source.slice(0, 57) + '…'
      : result.source;
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`-# ${display}`),
    );
  }

  return {
    components: [container],
    flags: MessageFlags.IsComponentsV2,
  };
}
