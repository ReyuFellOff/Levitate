import { config } from '../../config.js';
// xoxo/components/moderation/softban.ts
//
// Components V2 payload for the softban command.

import {
  ContainerBuilder,
  SectionBuilder,
  SeparatorBuilder,
  TextDisplayBuilder,
  ThumbnailBuilder,
  MessageFlags,
} from 'discord.js';

type HistoryChoice = 'none' | '1h' | '6h' | '12h' | '1d' | '3d' | '7d';

function historyLabel(choice: HistoryChoice): string {
  return {
    none: 'Don’t delete any',
    '1h': 'Previous hour',
    '6h': 'Previous 6 hours',
    '12h': 'Previous 12 hours',
    '1d': 'Previous 24 hours',
    '3d': 'Previous 3 days',
    '7d': 'Previous 7 days',
  }[choice];
}

export function buildSoftbanSuccessPayload(
  targetUser: any,
  reason: string,
  historyChoice: HistoryChoice,
  moderatorUsername: string,
): any {
  const section = new SectionBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent([
        `<@${targetUser.id}> (${targetUser.username})`,
        `**User ID:** \`${targetUser.id}\``,
        `**Deleted messages:** ${historyLabel(historyChoice)}`,
        `**Reason:** ${reason || 'No reason provided.'}`,
        `**Moderator:** ${moderatorUsername}`,
      ].join('\n')),
    )
    .setThumbnailAccessory(
      new ThumbnailBuilder().setURL(targetUser.displayAvatarURL({ forceStatic: false, size: 128 })),
    );

  const container = new ContainerBuilder().setAccentColor(parseInt(config.defaultAccentColor.replace('#', ''), 16))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent('## Softbanned'))
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
    .addSectionComponents(section)
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true));

  return {
    components:      [container],
    flags:           MessageFlags.IsComponentsV2,
    allowedMentions: { parse: [] },
  };
}