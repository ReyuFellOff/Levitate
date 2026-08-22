import { config } from '../../config.js';
// xoxo/components/moderation/warn.ts
//
// CV2 payloads for warn / warnings / clearwarnings.

import {
  ContainerBuilder,
  SectionBuilder,
  ThumbnailBuilder,
  SeparatorBuilder,
  TextDisplayBuilder,
  MessageFlags,
} from 'discord.js';
import { emojis } from '../../emojis.js';
import type { WarningDoc } from '../../database/database.js';

// ─────────────────────────────────────────────────────────────────────────────
// warn — success panel + DM
// ─────────────────────────────────────────────────────────────────────────────

export function buildWarnSuccessPayload(
  targetUser:        any,
  reason:            string,
  moderatorUsername: string,
  warningCount:      number,
): any {
  const avatarUrl = targetUser.displayAvatarURL({ forceStatic: false, size: 128 });

  const bodyLines = [
    `<@${targetUser.id}> (${targetUser.username})`,
    `**User ID:** \`${targetUser.id}\``,
    `**Reason:** ${reason || 'None provided.'}`,
    `**Moderator:** ${moderatorUsername}`,
    `**Total warnings:** ${warningCount}`,
  ].join('\n');

  const section = new SectionBuilder()
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(bodyLines))
    .setThumbnailAccessory(new ThumbnailBuilder().setURL(avatarUrl));

  const container = new ContainerBuilder().setAccentColor(parseInt(config.defaultAccentColor.replace('#', ''), 16))
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`## ${emojis.blackCards} Warned`),
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

export function buildWarnDmPayload(
  guildName:         string,
  reason:            string,
  moderatorUsername: string,
  warningCount:      number,
): any {
  const container = new ContainerBuilder().setAccentColor(parseInt(config.defaultAccentColor.replace('#', ''), 16)).addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `## ${emojis.blackCards} You have been warned in **${guildName}**\n` +
      `**Reason:** ${reason || 'None provided.'}\n` +
      `**Total warnings:** ${warningCount}\n` +
      `-# Moderator: ${moderatorUsername}`,
    ),
  );

  return {
    components: [container],
    flags:      MessageFlags.IsComponentsV2,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// warnings — list panel
// ─────────────────────────────────────────────────────────────────────────────

export function buildWarningsListPayload(targetUser: any, warnings: WarningDoc[]): any {
  if (warnings.length === 0) {
    const container = new ContainerBuilder().setAccentColor(parseInt(config.defaultAccentColor.replace('#', ''), 16)).addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`## ${emojis.info} **${targetUser.username}** has no warnings.`),
    );
    return {
      components:      [container],
      flags:           MessageFlags.IsComponentsV2,
      allowedMentions: { parse: [] },
    };
  }

  const shown = warnings.slice(-25);
  const lines = shown.map((w, i) => {
    const idx = warnings.length - shown.length + i + 1;
    const timestamp = Math.floor(new Date(w.created_at).getTime() / 1000);
    return `**${idx}.** ${w.reason || 'No reason provided.'}\n-# By <@${w.moderator_id}> · <t:${timestamp}:R>`;
  });

  const note = warnings.length > 25 ? `\n-# Showing latest 25 of ${warnings.length} warnings.` : '';

  const container = new ContainerBuilder().setAccentColor(parseInt(config.defaultAccentColor.replace('#', ''), 16))
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `## ${emojis.blackCards} Warnings for ${targetUser.username} (${warnings.length})`,
      ),
    )
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(lines.join('\n\n') + note))
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true));

  return {
    components:      [container],
    flags:           MessageFlags.IsComponentsV2,
    allowedMentions: { parse: [] },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// clearwarnings — result panel
// ─────────────────────────────────────────────────────────────────────────────

export function buildClearWarningsResultPayload(targetUser: any, count: number): any {
  const container = new ContainerBuilder().setAccentColor(parseInt(config.defaultAccentColor.replace('#', ''), 16)).addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `## ${emojis.greentick} Cleared **${count}** warning${count !== 1 ? 's' : ''} for **${targetUser.username}**.`,
    ),
  );

  return {
    components:      [container],
    flags:           MessageFlags.IsComponentsV2,
    allowedMentions: { parse: [] },
  };
}
