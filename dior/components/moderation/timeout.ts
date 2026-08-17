// xoxo/components/moderation/timeout.ts
//
// CV2 payloads for the timeout command — success panels and DM notifications.

import {
  ContainerBuilder,
  SectionBuilder,
  ThumbnailBuilder,
  SeparatorBuilder,
  TextDisplayBuilder,
  MessageFlags,
} from 'discord.js';
import { emojis } from '../../emojis.js';
import { formatDuration } from '../../helpers/parseDuration.js';

// ─────────────────────────────────────────────────────────────────────────────
// Timeout added — success panel
// ─────────────────────────────────────────────────────────────────────────────

export function buildTimeoutAddPayload(
  targetUser:        any,
  durationMs:        number,
  reason:            string,
  moderatorUsername: string,
  dmSent:            boolean,
): any {
  const avatarUrl  = targetUser.displayAvatarURL({ forceStatic: false, size: 128 });
  const expiresSec = Math.floor((Date.now() + durationMs) / 1000);

  const bodyLines = [
    `<@${targetUser.id}> (${targetUser.username})`,
    `**User ID:** \`${targetUser.id}\``,
    `**Duration:** ${formatDuration(durationMs)} *(expires <t:${expiresSec}:R>)*`,
    `**Reason:** ${reason || 'None provided.'}`,
    `**Moderator:** ${moderatorUsername}`,
    `**Notified:** ${dmSent ? 'Yes — DM sent' : 'No — could not DM'}`,
  ].join('\n');

  const section = new SectionBuilder()
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(bodyLines))
    .setThumbnailAccessory(new ThumbnailBuilder().setURL(avatarUrl));

  const container = new ContainerBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`## ${emojis.clock} Timed Out`),
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
// Timeout removed — success panel
// ─────────────────────────────────────────────────────────────────────────────

export function buildTimeoutRemovePayload(
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

  const container = new ContainerBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`## ${emojis.greentick} Timeout Removed`),
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
// DM — timeout added
// ─────────────────────────────────────────────────────────────────────────────

export function buildTimeoutAddDmPayload(
  guildName:         string,
  durationMs:        number,
  reason:            string,
  moderatorUsername: string,
): any {
  const container = new ContainerBuilder().addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `## ${emojis.clock} You have been timed out in **${guildName}**\n` +
      `**Duration:** ${formatDuration(durationMs)}\n` +
      `**Reason:** ${reason || 'None provided.'}\n` +
      `-# Moderator: ${moderatorUsername}`,
    ),
  );

  return {
    components: [container],
    flags:      MessageFlags.IsComponentsV2,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// DM — timeout removed (manual untimeout)
// ─────────────────────────────────────────────────────────────────────────────

export function buildTimeoutRemoveDmPayload(
  guildName:         string,
  reason:            string,
  moderatorUsername: string,
): any {
  const container = new ContainerBuilder().addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `## ${emojis.greentick} Your timeout in **${guildName}** has been removed\n` +
      `**Reason:** ${reason || 'None provided.'}\n` +
      `-# Moderator: ${moderatorUsername}`,
    ),
  );

  return {
    components: [container],
    flags:      MessageFlags.IsComponentsV2,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// DM — timeout expired naturally
// ─────────────────────────────────────────────────────────────────────────────

export function buildTimeoutExpiredDmPayload(guildName: string): any {
  const container = new ContainerBuilder().addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `## ${emojis.greentick1} Your timeout in **${guildName}** has expired\n` +
      `-# You can now send messages and interact in the server again.`,
    ),
  );

  return {
    components: [container],
    flags:      MessageFlags.IsComponentsV2,
  };
}
