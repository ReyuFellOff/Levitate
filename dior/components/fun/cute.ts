// xoxo/components/fun/cute.ts
//
// CV2 payload builder for the $cute / $howcute command.
// Canvas work lives in xoxo/structures/CuteCanvas.ts (per spec).

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
import { pickCuteCaption } from '../../config/captions/captionPickers.js';

export async function buildCutePayload(opts: {
  user:        any;
  pct:         number;   // Infinity for developer
  displayName: string;
}): Promise<any> {
  const { user, pct, displayName } = opts;

  const caption = pickCuteCaption(pct);

  // Try a few URL variants before giving up — some users' avatars fail to
  // load on the first attempt (CDN hiccups, animated-avatar edge cases, etc.).
  const avatarURLs = [
    user.displayAvatarURL({ forceStatic: true, size: 128, extension: 'png' }),
    user.displayAvatarURL({ forceStatic: true, size: 256, extension: 'png' }),
    user.displayAvatarURL({ forceStatic: true, size: 64, extension: 'webp' }),
    user.defaultAvatarURL,
  ];
  const imageBuffer = await generateRatingCanvas({ avatarURLs, displayName, pct, caption, theme: pinkTheme });

  const gallery = new MediaGalleryBuilder()
    .addItems(new MediaGalleryItemBuilder().setURL('attachment://cute.png'));

  const container = new ContainerBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `${emojis.butterflyPink} **How cute is <@${user.id}>?**`,
      ),
    )
    .addMediaGalleryComponents(gallery)
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true));

  return {
    components:      [container],
    files:           [{ attachment: imageBuffer, name: 'cute.png' }],
    flags:           MessageFlags.IsComponentsV2,
    allowedMentions: { parse: [] },
  };
}
