import { config } from '../../config.js';
// xoxo/components/moderation/ban.ts
//
// CV2 payloads for the ban command — success panel and DM notification.

import {
  ContainerBuilder,
  SectionBuilder,
  ThumbnailBuilder,
  SeparatorBuilder,
  TextDisplayBuilder,
  MessageFlags,
} from 'discord.js';
import { emojis } from '../../emojis.js';

// ─────────────────────────────────────────────────────────────────────────────
// Success panel (sent in the server channel)
// ─────────────────────────────────────────────────────────────────────────────

export function buildBanSuccessPayload(
  targetUser:        any,
  reason:            string,
  deleteDays:        number,
  moderatorUsername: string,
  dmSent:            boolean,
): any {
  const avatarUrl = targetUser.displayAvatarURL({ forceStatic: false, size: 128 });

  const bodyLines: string[] = [
    `<@${targetUser.id}> (${targetUser.username})`,
    `**User ID:** \`${targetUser.id}\``,
    ...(deleteDays > 0 ? [`**Deleted messages:** Last ${deleteDays} day${deleteDays === 1 ? '' : 's'}`] : []),
    `**Reason:** ${reason || 'None provided.'}`,
    `**Moderator:** ${moderatorUsername}`,
    `**Notified:** ${dmSent ? 'Yes — DM sent' : 'No — could not DM'}`,
  ];

  const section = new SectionBuilder()
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(bodyLines.join('\n')))
    .setThumbnailAccessory(new ThumbnailBuilder().setURL(avatarUrl));

  const container = new ContainerBuilder().setAccentColor(parseInt(config.defaultAccentColor.replace('#', ''), 16))
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`## ${emojis.blackCards} Banned`),
    )
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
    .addSectionComponents(section)
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true));

  return {
    components:      [container],
    flags:           MessageFlags.IsComponentsV2,
    allowedMentions: { parse: [] },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// DM notification (sent to the target before the ban)
// ─────────────────────────────────────────────────────────────────────────────

export function buildBanDmPayload(
  guildName:         string,
  reason:            string,
  moderatorUsername: string,
): any {
  const container = new ContainerBuilder().setAccentColor(parseInt(config.defaultAccentColor.replace('#', ''), 16)).addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `## ${emojis.blackCards} You have been banned from **${guildName}**\n` +
      `**Reason:** ${reason || 'None provided.'}\n` +
      `-# Moderator: ${moderatorUsername}`,
    ),
  );

  return {
    components: [container],
    flags:      MessageFlags.IsComponentsV2,
  };
}
