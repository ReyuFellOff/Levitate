// xoxo/components/moderation/modlog.ts
//
// CV2 payload builders for modlog entries.
// Each builder produces a payload ready to be sent to the guild's modlog channel.

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
// Internal shared builder
// ─────────────────────────────────────────────────────────────────────────────

function buildEntry(
  header:      string,
  lines:       string[],
  targetUser?: any,
): any {
  const nowSec   = Math.floor(Date.now() / 1000);
  const bodyText = [...lines, `**Time:** <t:${nowSec}:f>`].join('\n');

  let container = new ContainerBuilder().addTextDisplayComponents(
    new TextDisplayBuilder().setContent(header),
  );

  container = container.addSeparatorComponents(new SeparatorBuilder().setDivider(true));

  if (targetUser) {
    const avatarUrl = targetUser.displayAvatarURL({ forceStatic: false, size: 128 });
    const section   = new SectionBuilder()
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(bodyText))
      .setThumbnailAccessory(new ThumbnailBuilder().setURL(avatarUrl));
    container = container.addSectionComponents(section);
  } else {
    container = container.addTextDisplayComponents(new TextDisplayBuilder().setContent(bodyText));
  }

  container = container.addSeparatorComponents(new SeparatorBuilder().setDivider(true));

  return {
    components:      [container],
    flags:           MessageFlags.IsComponentsV2,
    allowedMentions: { parse: [] },
  };
}

export function buildModLogMemberRestriction(
  targetUser: any,
  kind: 'image' | 'reaction',
  enabled: boolean,
  reason: string,
  moderatorUsername: string,
): any {
  const label = kind === 'image' ? 'Image sending' : 'Reaction adding';
  const action = enabled ? 'Restricted' : 'Restriction removed';
  const lines = [
    `<@${targetUser.id}> (${targetUser.username})`,
    `**User ID:** \`${targetUser.id}\``,
    `**Restriction:** ${label}`,
    `**Reason:** ${reason}`,
    `**Moderator:** ${moderatorUsername}`,
  ];
  return buildEntry(`## ${emojis.blackCards} ${action}`, lines, targetUser);
}

// ─────────────────────────────────────────────────────────────────────────────
// Ban
// ─────────────────────────────────────────────────────────────────────────────

export function buildModLogBan(
  targetUser:        any,
  reason:            string,
  moderatorUsername: string,
  deleteDays:        number,
  dmSent:            boolean,
): any {
  const lines = [
    `<@${targetUser.id}> (${targetUser.username})`,
    `**User ID:** \`${targetUser.id}\``,
    ...(deleteDays > 0 ? [`**Deleted messages:** Last ${deleteDays} day${deleteDays === 1 ? '' : 's'}`] : []),
    `**Reason:** ${reason}`,
    `**Moderator:** ${moderatorUsername}`,
    `**Notified:** ${dmSent ? 'Yes' : 'No'}`,
  ];
  return buildEntry(`## ${emojis.blackCards} Banned`, lines, targetUser);
}

// ─────────────────────────────────────────────────────────────────────────────
// Kick
// ─────────────────────────────────────────────────────────────────────────────

export function buildModLogKick(
  targetUser:        any,
  reason:            string,
  moderatorUsername: string,
  dmSent:            boolean,
): any {
  const lines = [
    `<@${targetUser.id}> (${targetUser.username})`,
    `**User ID:** \`${targetUser.id}\``,
    `**Reason:** ${reason}`,
    `**Moderator:** ${moderatorUsername}`,
    `**Notified:** ${dmSent ? 'Yes' : 'No'}`,
  ];
  return buildEntry(`## ${emojis.blackCards} Kicked`, lines, targetUser);
}

// ─────────────────────────────────────────────────────────────────────────────
// Timeout (add)
// ─────────────────────────────────────────────────────────────────────────────

export function buildModLogTimeout(
  targetUser:        any,
  durationMs:        number,
  reason:            string,
  moderatorUsername: string,
  dmSent:            boolean,
): any {
  const lines = [
    `<@${targetUser.id}> (${targetUser.username})`,
    `**User ID:** \`${targetUser.id}\``,
    `**Duration:** ${formatDuration(durationMs)}`,
    `**Reason:** ${reason}`,
    `**Moderator:** ${moderatorUsername}`,
    `**Notified:** ${dmSent ? 'Yes' : 'No'}`,
  ];
  return buildEntry(`## ${emojis.clock} Timed Out`, lines, targetUser);
}

// ─────────────────────────────────────────────────────────────────────────────
// Timeout (remove / untimeout) — single target
// ─────────────────────────────────────────────────────────────────────────────

export function buildModLogUnTimeout(
  targetUser:        any,
  reason:            string,
  moderatorUsername: string,
): any {
  const lines = [
    `<@${targetUser.id}> (${targetUser.username})`,
    `**User ID:** \`${targetUser.id}\``,
    `**Reason:** ${reason}`,
    `**Moderator:** ${moderatorUsername}`,
  ];
  return buildEntry(`## ${emojis.greentick} Timeout Removed`, lines, targetUser);
}

// ─────────────────────────────────────────────────────────────────────────────
// Unban — single target
// ─────────────────────────────────────────────────────────────────────────────

export function buildModLogUnban(
  targetUser:        any,
  reason:            string,
  moderatorUsername: string,
): any {
  const lines = [
    `<@${targetUser.id}> (${targetUser.username})`,
    `**User ID:** \`${targetUser.id}\``,
    `**Reason:** ${reason}`,
    `**Moderator:** ${moderatorUsername}`,
  ];
  return buildEntry(`## ${emojis.greentick} Unbanned`, lines, targetUser);
}

// ─────────────────────────────────────────────────────────────────────────────
// Hackban
// ─────────────────────────────────────────────────────────────────────────────

export function buildModLogHackban(
  userId:            string,
  username:          string | null,
  reason:            string,
  moderatorUsername: string,
): any {
  const lines = [
    ...(username ? [`**Username:** ${username}`] : []),
    `**User ID:** \`${userId}\``,
    `**Reason:** ${reason}`,
    `**Moderator:** ${moderatorUsername}`,
  ];
  return buildEntry(`## ${emojis.blackCards} Hackbanned`, lines);
}

// ─────────────────────────────────────────────────────────────────────────────
// Warn
// ─────────────────────────────────────────────────────────────────────────────

export function buildModLogWarn(
  targetUser:        any,
  reason:            string,
  moderatorUsername: string,
  totalWarnings:     number,
): any {
  const lines = [
    `<@${targetUser.id}> (${targetUser.username})`,
    `**User ID:** \`${targetUser.id}\``,
    `**Reason:** ${reason}`,
    `**Total warnings:** ${totalWarnings}`,
    `**Moderator:** ${moderatorUsername}`,
  ];
  return buildEntry(`## ${emojis.bloodRip} Warning Issued`, lines, targetUser);
}

// ─────────────────────────────────────────────────────────────────────────────
// Clear Warnings
// ─────────────────────────────────────────────────────────────────────────────

export function buildModLogClearWarnings(
  targetUser:        any,
  count:             number,
  moderatorUsername: string,
): any {
  const lines = [
    `<@${targetUser.id}> (${targetUser.username})`,
    `**User ID:** \`${targetUser.id}\``,
    `**Warnings cleared:** ${count}`,
    `**Moderator:** ${moderatorUsername}`,
  ];
  return buildEntry(`## ${emojis.greentick} Warnings Cleared`, lines, targetUser);
}

// ─────────────────────────────────────────────────────────────────────────────
// Strip (roles removed)
// ─────────────────────────────────────────────────────────────────────────────

export function buildModLogStrip(
  targetUser:        any,
  removed:           number,
  skipped:           number,
  moderatorUsername: string,
): any {
  const lines = [
    `<@${targetUser.id}> (${targetUser.username})`,
    `**User ID:** \`${targetUser.id}\``,
    `**Roles removed:** ${removed}`,
    ...(skipped > 0 ? [`**Skipped (managed/higher):** ${skipped}`] : []),
    `**Moderator:** ${moderatorUsername}`,
  ];
  return buildEntry(`## ${emojis.blackCards} Roles Stripped`, lines, targetUser);
}

// ─────────────────────────────────────────────────────────────────────────────
// Nick (nickname change or reset)
// ─────────────────────────────────────────────────────────────────────────────

export function buildModLogNick(
  targetUser:        any,
  oldNick:           string | null,
  newNick:           string | null,
  moderatorUsername: string,
): any {
  const isReset = newNick === null;
  const lines   = [
    `<@${targetUser.id}> (${targetUser.username})`,
    `**User ID:** \`${targetUser.id}\``,
    `**Old nickname:** ${oldNick ?? '*none*'}`,
    `**New nickname:** ${isReset ? '*reset*' : newNick}`,
    `**Moderator:** ${moderatorUsername}`,
  ];
  return buildEntry(`## ${emojis.blackCards} Nickname Changed`, lines, targetUser);
}
