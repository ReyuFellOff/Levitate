import { config } from '../../config.js';
// xoxo/components/fun/simp.ts
//
// CV2 payload builder for the $simp command. Reuses RatingCanvas (pinkTheme).

import {
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  MessageFlags,
} from 'discord.js';
import { emojis } from '../../emojis.js';
import { generateRatingCanvas, pinkTheme } from '../../structures/RatingCanvas.js';
import { pickSimpCaption } from '../../config/captions/captionPickers.js';

export async function buildSimpPayload(opts: {
  user:        any;
  pct:         number;
  displayName: string;
}): Promise<any> {
  const { user, pct, displayName } = opts;

  const caption = pickSimpCaption(pct);

  const avatarURLs = [
    user.displayAvatarURL({ forceStatic: true, size: 128, extension: 'png' }),
    user.displayAvatarURL({ forceStatic: true, size: 256, extension: 'png' }),
    user.displayAvatarURL({ forceStatic: true, size: 64, extension: 'webp' }),
    user.defaultAvatarURL,
  ];
  const imageBuffer = await generateRatingCanvas({ avatarURLs, displayName, pct, caption, theme: pinkTheme });

  const gallery = new MediaGalleryBuilder()
    .addItems(new MediaGalleryItemBuilder().setURL('attachment://simp.png'));

  const container = new ContainerBuilder().setAccentColor(parseInt(config.defaultAccentColor.replace('#', ''), 16))
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `${emojis.butterflyPink ?? '💗'} **How much of a simp is <@${user.id}>?**`,
      ),
    )
    .addMediaGalleryComponents(gallery)
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true));

  return {
    components:      [container],
    files:           [{ attachment: imageBuffer, name: 'simp.png' }],
    flags:           MessageFlags.IsComponentsV2,
    allowedMentions: { parse: [] },
  };
}
