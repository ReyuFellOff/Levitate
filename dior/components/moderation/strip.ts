import { config } from '../../config.js';
// xoxo/components/moderation/strip.ts
//
// CV2 payload for the strip command — success panel.

import {
  ContainerBuilder,
  SeparatorBuilder,
  TextDisplayBuilder,
  MessageFlags,
} from 'discord.js';
import { emojis } from '../../emojis.js';

export function buildStripSuccessPayload(
  targetUser:        any,
  removedCount:       number,
  skippedCount:       number,
  moderatorUsername: string,
): any {
  const bodyLines = [
    `<@${targetUser.id}> (${targetUser.username})`,
    `**Roles removed:** ${removedCount}`,
    ...(skippedCount > 0 ? [`**Roles kept (managed/higher):** ${skippedCount}`] : []),
    `**Moderator:** ${moderatorUsername}`,
  ].join('\n');

  const container = new ContainerBuilder().setAccentColor(parseInt(config.defaultAccentColor.replace('#', ''), 16))
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`## ${emojis.blackCards} Roles Stripped`),
    )
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(bodyLines))
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true));

  return {
    components:      [container],
    flags:           MessageFlags.IsComponentsV2,
    allowedMentions: { parse: [] },
  };
}
