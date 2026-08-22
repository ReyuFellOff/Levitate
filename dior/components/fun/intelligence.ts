import { config } from '../../config.js';
// xoxo/components/fun/intelligence.ts
//
// CV2 payload builder for the $intelligence / $iq command.
// Canvas work lives in xoxo/structures/RatingCanvas.ts (blue theme).

import {
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  MessageFlags,
} from 'discord.js';
import { emojis } from '../../emojis.js';
import { generateRatingCanvas, blueTheme } from '../../structures/RatingCanvas.js';
import { pickIntelligenceCaption } from '../../config/captions/captionPickers.js';

export async function buildIntelligencePayload(opts: {
  user:        any;
  pct:         number;   // Infinity for developer
  displayName: string;
}): Promise<any> {
  const { user, pct, displayName } = opts;

  const caption = pickIntelligenceCaption(pct);

  const avatarURLs = [
    user.displayAvatarURL({ forceStatic: true, size: 128, extension: 'png' }),
    user.displayAvatarURL({ forceStatic: true, size: 256, extension: 'png' }),
    user.displayAvatarURL({ forceStatic: true, size: 64, extension: 'webp' }),
    user.defaultAvatarURL,
  ];
  const imageBuffer = await generateRatingCanvas({ avatarURLs, displayName, pct, caption, theme: blueTheme });

  const gallery = new MediaGalleryBuilder()
    .addItems(new MediaGalleryItemBuilder().setURL('attachment://intelligence.png'));

  const container = new ContainerBuilder().setAccentColor(parseInt(config.defaultAccentColor.replace('#', ''), 16))
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `${emojis.blacksparkles} **How intelligent is <@${user.id}>?**`,
      ),
    )
    .addMediaGalleryComponents(gallery)
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true));

  return {
    components:      [container],
    files:           [{ attachment: imageBuffer, name: 'intelligence.png' }],
    flags:           MessageFlags.IsComponentsV2,
    allowedMentions: { parse: [] },
  };
}
