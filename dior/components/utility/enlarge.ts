import { config } from '../../config.js';
// xoxo/components/utility/enlarge.ts
//
// CV2 payload for the $enlarge command.
// Layout:
//   ### Enlarged <:name:id>
//   ─── (visible separator, small gap)
//   (emoji image)

import {
  ContainerBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  MessageFlags,
  SeparatorBuilder,
  SeparatorSpacingSize,
  TextDisplayBuilder,
} from 'discord.js';

/**
 * @param emojiLabel  - The emoji rendered inline as markdown, e.g. `<:star:123>` or `<a:spin:456>`
 * @param imageUrl    - CDN URL of the emoji image (PNG or GIF, size=4096)
 */
export function buildEnlargePayload(emojiLabel: string, imageUrl: string) {
  const container = new ContainerBuilder().setAccentColor(parseInt(config.defaultAccentColor.replace('#', ''), 16))
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`### Enlarged ${emojiLabel}`),
    )
    .addSeparatorComponents(
      new SeparatorBuilder({ spacing: SeparatorSpacingSize.Small, divider: true }),
    )
    .addMediaGalleryComponents(
      new MediaGalleryBuilder().addItems(
        new MediaGalleryItemBuilder().setURL(imageUrl),
      ),
    );

  return {
    components: [container],
    flags:      MessageFlags.IsComponentsV2,
  };
}
