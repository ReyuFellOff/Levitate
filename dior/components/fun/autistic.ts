import { config } from '../../config.js';
// xoxo/components/fun/autistic.ts
//
// CV2 payload builder for the $autistic command.
// Canvas work lives in xoxo/structures/RatingCanvas.ts (teal theme).

import {
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  MessageFlags,
} from 'discord.js';
import { emojis } from '../../emojis.js';
import { generateRatingCanvas, tealTheme } from '../../structures/RatingCanvas.js';
import { pickAutisticCaption } from '../../config/captions/captionPickers.js';

export async function buildAutisticPayload(opts: {
  user:        any;
  pct:         number;   // Infinity for developer
  displayName: string;
}): Promise<any> {
  const { user, pct, displayName } = opts;

  const caption = pickAutisticCaption(pct);

  const avatarURLs = [
    user.displayAvatarURL({ forceStatic: true, size: 128, extension: 'png' }),
    user.displayAvatarURL({ forceStatic: true, size: 256, extension: 'png' }),
    user.displayAvatarURL({ forceStatic: true, size: 64, extension: 'webp' }),
    user.defaultAvatarURL,
  ];
  const imageBuffer = await generateRatingCanvas({ avatarURLs, displayName, pct, caption, theme: tealTheme });

  const gallery = new MediaGalleryBuilder()
    .addItems(new MediaGalleryItemBuilder().setURL('attachment://autistic.png'));

  const container = new ContainerBuilder().setAccentColor(parseInt(config.defaultAccentColor.replace('#', ''), 16))
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `${emojis.info} **How autistic is <@${user.id}>?**`,
      ),
    )
    .addMediaGalleryComponents(gallery)
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true));

  return {
    components:      [container],
    files:           [{ attachment: imageBuffer, name: 'autistic.png' }],
    flags:           MessageFlags.IsComponentsV2,
    allowedMentions: { parse: [] },
  };
}
