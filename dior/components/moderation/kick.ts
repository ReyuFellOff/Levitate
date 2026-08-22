import { config } from '../../config.js';
// xoxo/components/moderation/kick.ts
//
// CV2 payloads for the kick command — success panel and DM notification.

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

export function buildKickSuccessPayload(
  targetUser:        any,
  reason:            string,
  moderatorUsername: string,
  dmSent:            boolean,
): any {
  const avatarUrl = targetUser.displayAvatarURL({ forceStatic: false, size: 128 });

  const bodyLines = [
    `<@${targetUser.id}> (${targetUser.username})`,
    `**User ID:** \`${targetUser.id}\``,
    `**Reason:** ${reason || 'None provided.'}`,
    `**Moderator:** ${moderatorUsername}`,
    `**Notified:** ${dmSent ? 'Yes — DM sent' : 'No — could not DM'}`,
  ].join('\n');

  const section = new SectionBuilder()
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(bodyLines))
    .setThumbnailAccessory(new ThumbnailBuilder().setURL(avatarUrl));

  const container = new ContainerBuilder().setAccentColor(parseInt(config.defaultAccentColor.replace('#', ''), 16))
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`## ${emojis.blackCards} Kicked`),
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
// DM notification (sent to the target before the kick)
// ─────────────────────────────────────────────────────────────────────────────

export function buildKickDmPayload(
  guildName:         string,
  reason:            string,
  moderatorUsername: string,
): any {
  const container = new ContainerBuilder().setAccentColor(parseInt(config.defaultAccentColor.replace('#', ''), 16)).addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `## ${emojis.blackCards} You have been kicked from **${guildName}**\n` +
      `**Reason:** ${reason || 'None provided.'}\n` +
      `-# Moderator: ${moderatorUsername}`,
    ),
  );

  return {
    components: [container],
    flags:      MessageFlags.IsComponentsV2,
  };
}
