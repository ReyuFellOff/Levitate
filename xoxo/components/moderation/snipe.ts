// xoxo/components/moderation/snipe.ts
//
// CV2 payload builder for $snipe — simple single-message display.

import {
  ContainerBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  MessageFlags,
  SectionBuilder,
  SeparatorBuilder,
  TextDisplayBuilder,
  ThumbnailBuilder,
} from 'discord.js';
import { emojis }                        from '../../emojis.js';
import type { SnipedMessage }            from './snipeStore.js';

function ts(ms: number): string {
  return `<t:${Math.floor(ms / 1000)}:R>`;
}

function isImageUrl(url: string): boolean {
  const p = url.toLowerCase().split('?')[0];
  return p.endsWith('.png') || p.endsWith('.jpg') || p.endsWith('.jpeg') ||
         p.endsWith('.webp') || p.endsWith('.gif');
}

export function buildSnipePayload(snipe: SnipedMessage, channelId: string): any {
  const container = new ContainerBuilder();

  // Header
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `## ${emojis.blackCards} Snipe — <#${channelId}>`,
    ),
  );
  container.addSeparatorComponents(new SeparatorBuilder().setDivider(true));

  // Content
  const display = snipe.content
    ? (snipe.content.length > 1500 ? snipe.content.slice(0, 1497) + '…' : snipe.content)
    : '*No text content*';

  const meta = [
    `**Author:** <@${snipe.authorId}> (\`${snipe.authorName}\`)`,
    `**Sent:** ${ts(snipe.createdAt)}  •  **Deleted:** ${ts(snipe.deletedAt)}`,
    snipe.replyTo
      ? `**Reply to:** [Jump](https://discord.com/channels/${snipe.guildId}/${snipe.channelId}/${snipe.replyTo})`
      : null,
    snipe.sticker    ? `**Sticker:** ${snipe.sticker}` : null,
    snipe.embedCount ? `**Embeds:** ${snipe.embedCount}` : null,
    snipe.attachments.length
      ? `**Attachments:** ${snipe.attachments.length}`
      : null,
    '',
    display,
  ].filter((l): l is string => l !== null).join('\n');

  if (snipe.authorAvatar) {
    container.addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(meta))
        .setThumbnailAccessory(new ThumbnailBuilder().setURL(snipe.authorAvatar)),
    );
  } else {
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(meta));
  }

  // First image attachment if any
  const img = snipe.attachments.find(isImageUrl);
  if (img) {
    container.addSeparatorComponents(new SeparatorBuilder().setDivider(false));
    container.addMediaGalleryComponents(
      new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(img)),
    );
  }

  container.addSeparatorComponents(new SeparatorBuilder().setDivider(true));
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent('-# Snipe data is lost when the bot restarts.'),
  );

  return {
    components:      [container],
    flags:           MessageFlags.IsComponentsV2,
    allowedMentions: { parse: [] },
  };
}
