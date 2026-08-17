// xoxo/components/moderation/snipe.ts

import {
  ContainerBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  MessageFlags,
  SectionBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  TextDisplayBuilder,
  ThumbnailBuilder,
} from 'discord.js';
import { emojis }             from '../../emojis.js';
import type { SnipedMessage } from './snipeStore.js';

const ACCENT_COLOR   = 0xECC2BB;
const MAX_GALLERY_ITEMS = 10;

function ts(ms: number): string {
  return `<t:${Math.floor(ms / 1000)}:R>`;
}

function isImageUrl(url: string): boolean {
  const p = url.toLowerCase().split('?')[0];
  return p.endsWith('.png') || p.endsWith('.jpg') || p.endsWith('.jpeg') ||
         p.endsWith('.webp') || p.endsWith('.gif');
}

function attachmentFileName(url: string): string {
  try {
    const clean = url.split('?')[0];
    const name  = clean.split('/').pop();
    return name ? decodeURIComponent(name) : url;
  } catch {
    return url;
  }
}

export function buildSnipePayload(snipe: SnipedMessage, channelId: string): any {
  const container = new ContainerBuilder().setAccentColor(ACCENT_COLOR);

  // ── Header ────────────────────────────────────────────────────────────
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `### ${emojis.blackCards} Snipe - <#${channelId}>`,
    ),
  );
  container.addSeparatorComponents(
    new SeparatorBuilder({ spacing: SeparatorSpacingSize.Small, divider: true }),
  );

  // ── Info section (with author avatar thumbnail) ───────────────────────
  const textContent = snipe.content
    ? (snipe.content.length > 1500 ? snipe.content.slice(0, 1497) + '…' : snipe.content)
    : null;

  const attachmentCount = snipe.attachments.length;

  const bodyLines = [
    `**Author:** <@${snipe.authorId}> (\`${snipe.authorName}\`)`,
    `**Sent at:** ${ts(snipe.createdAt)}`,
    `**Deleted at:** ${ts(snipe.deletedAt)}`,
    textContent
      ? `**Text Content:**\n${textContent}`
      : `**Text Content:** None`,
    attachmentCount > 0
      ? `**Attachments:** ${attachmentCount}`
      : `**Attachments:** None.`,
  ].join('\n');

  if (snipe.authorAvatar) {
    container.addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(bodyLines))
        .setThumbnailAccessory(new ThumbnailBuilder().setURL(snipe.authorAvatar)),
    );
  } else {
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(bodyLines));
  }

  // ── Attachments (only when present) ───────────────────────────────────
  if (attachmentCount > 0) {
    container.addSeparatorComponents(
      new SeparatorBuilder({ spacing: SeparatorSpacingSize.Small, divider: true }),
    );

    const images    = snipe.attachments.filter(isImageUrl);
    const nonImages = snipe.attachments.filter((a) => !isImageUrl(a));

    if (images.length) {
      container.addMediaGalleryComponents(
        new MediaGalleryBuilder().addItems(
          ...images.slice(0, MAX_GALLERY_ITEMS).map((url) => new MediaGalleryItemBuilder().setURL(url)),
        ),
      );
    }

    if (attachmentCount > 1 || nonImages.length) {
      const isMultiple = attachmentCount > 1;
      const links = snipe.attachments
        .map((url, i) =>
          isMultiple
            ? `[Attachment ${i + 1}](${url})`
            : `[${attachmentFileName(url)}](${url})`,
        )
        .join('\n');
      container.addTextDisplayComponents(new TextDisplayBuilder().setContent(links));
    }
  }

  // ── Footer ────────────────────────────────────────────────────────────
  container.addSeparatorComponents(
    new SeparatorBuilder({ spacing: SeparatorSpacingSize.Small, divider: true }),
  );
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent('-# Snipe data is lost when the bot restarts.'),
  );

  return {
    components:      [container],
    flags:           MessageFlags.IsComponentsV2,
    allowedMentions: { parse: [] },
  };
}
