// xoxo/components/fun/rizz.ts
//
// CV2 payload builder for the $rizz command. Reuses RatingCanvas (rainbowTheme).

import {
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  MessageFlags,
} from 'discord.js';
import { emojis } from '../../emojis.js';
import { generateRatingCanvas, rainbowTheme } from '../../structures/RatingCanvas.js';
import { pickRizzCaption } from '../../config/captions/captionPickers.js';

export async function buildRizzPayload(opts: {
  user:        any;
  pct:         number;
  displayName: string;
}): Promise<any> {
  const { user, pct, displayName } = opts;

  const caption = pickRizzCaption(pct);

  const avatarURLs = [
    user.displayAvatarURL({ forceStatic: true, size: 128, extension: 'png' }),
    user.displayAvatarURL({ forceStatic: true, size: 256, extension: 'png' }),
    user.displayAvatarURL({ forceStatic: true, size: 64, extension: 'webp' }),
    user.defaultAvatarURL,
  ];
  const imageBuffer = await generateRatingCanvas({ avatarURLs, displayName, pct, caption, theme: rainbowTheme });

  const gallery = new MediaGalleryBuilder()
    .addItems(new MediaGalleryItemBuilder().setURL('attachment://rizz.png'));

  const container = new ContainerBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `${emojis.butterflyPink ?? '✨'} **How much rizz does <@${user.id}> have?**`,
      ),
    )
    .addMediaGalleryComponents(gallery)
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true));

  return {
    components:      [container],
    files:           [{ attachment: imageBuffer, name: 'rizz.png' }],
    flags:           MessageFlags.IsComponentsV2,
    allowedMentions: { parse: [] },
  };
}
