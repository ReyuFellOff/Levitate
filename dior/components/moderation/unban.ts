import { config } from '../../config.js';
// xoxo/components/moderation/unban.ts
//
// CV2 payloads and interaction handler for the unban command.
// Handles the multi-select "pick who to unban" panel, its result, and the
// direct single-target success/DM panels.

import {
  ActionRowBuilder,
  ContainerBuilder,
  SectionBuilder,
  ThumbnailBuilder,
  SeparatorBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  TextDisplayBuilder,
  MessageFlags,
} from 'discord.js';
import type { CassieClient } from '../../structures/CassieClient.js';
import { emojis } from '../../emojis.js';
import { buildModLogUnban } from './modlog.js';
import { sendModLog } from '../../utils/modlogHelper.js';

// ─────────────────────────────────────────────────────────────────────────────
// Session store
// ─────────────────────────────────────────────────────────────────────────────

interface UnbanSession {
  invokerUserId: string;
  guildId:       string;
}

export const unbanSessions = new Map<string, UnbanSession>();

const SESSION_TTL_MS = 3 * 60 * 1_000; // 3 minutes

export function registerUnbanSession(
  messageId:     string,
  invokerUserId: string,
  guildId:       string,
): void {
  unbanSessions.set(messageId, { invokerUserId, guildId });
  setTimeout(() => unbanSessions.delete(messageId), SESSION_TTL_MS);
}

// ─────────────────────────────────────────────────────────────────────────────
// List panel — shown when no user argument is supplied
// ─────────────────────────────────────────────────────────────────────────────

export interface BannedEntry {
  userId:   string;
  username: string;
  reason:   string;
}

export function buildUnbanListPayload(entries: BannedEntry[]): any {
  const listText = entries
    .map(e => `${emojis.glowyWhiteArrow} **${e.username}** — ${e.reason || 'No reason provided.'}`)
    .join('\n');

  const maxSelect = Math.min(entries.length, 25);

  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId('unban:select')
    .setPlaceholder('Select users to unban…')
    .setMinValues(1)
    .setMaxValues(maxSelect)
    .addOptions(
      entries.slice(0, 25).map(e =>
        new StringSelectMenuOptionBuilder()
          .setLabel(e.username.slice(0, 100))
          .setValue(e.userId)
          .setDescription((e.reason || 'No reason provided.').slice(0, 100)),
      ),
    );

  const actionRow = new ActionRowBuilder().addComponents(selectMenu);

  const container = new ContainerBuilder().setAccentColor(parseInt(config.defaultAccentColor.replace('#', ''), 16))
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`## ${emojis.blackCards} Banned Users`),
    )
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(listText))
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
    .addActionRowComponents(actionRow as any);

  return {
    components:      [container],
    flags:           MessageFlags.IsComponentsV2,
    allowedMentions: { parse: [] },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Result panel — replaces the list panel after selections are processed
// ─────────────────────────────────────────────────────────────────────────────

export function buildUnbanResultPayload(
  results: { username: string; failed: boolean }[],
): any {
  const lines = results.map(r =>
    r.failed ? `- **${r.username}** — failed to unban` : `- **${r.username}** — unbanned`,
  );

  const container = new ContainerBuilder().setAccentColor(parseInt(config.defaultAccentColor.replace('#', ''), 16))
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`## ${emojis.greentick} User${results.length === 1 ? '' : 's'} Unbanned`),
    )
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(lines.join('\n')))
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true));

  return {
    components:      [container],
    flags:           MessageFlags.IsComponentsV2,
    allowedMentions: { parse: [] },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Direct unban — success panel + DM
// ─────────────────────────────────────────────────────────────────────────────

export function buildUnbanSuccessPayload(
  targetUser:        any,
  reason:            string,
  moderatorUsername: string,
): any {
  const avatarUrl = targetUser.displayAvatarURL({ forceStatic: false, size: 128 });

  const bodyLines = [
    `<@${targetUser.id}> (${targetUser.username})`,
    `**User ID:** \`${targetUser.id}\``,
    `**Reason:** ${reason || 'None provided.'}`,
    `**Moderator:** ${moderatorUsername}`,
  ].join('\n');

  const section = new SectionBuilder()
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(bodyLines))
    .setThumbnailAccessory(new ThumbnailBuilder().setURL(avatarUrl));

  const container = new ContainerBuilder().setAccentColor(parseInt(config.defaultAccentColor.replace('#', ''), 16))
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`## ${emojis.greentick} Unbanned`),
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

export function buildUnbanDmPayload(
  guildName:         string,
  reason:            string,
  moderatorUsername: string,
): any {
  const container = new ContainerBuilder().setAccentColor(parseInt(config.defaultAccentColor.replace('#', ''), 16)).addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `## ${emojis.greentick} You have been unbanned from **${guildName}**\n` +
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
// Interaction handler — called from interactionCreate for 'unban:select'
// ─────────────────────────────────────────────────────────────────────────────

export async function handleUnbanSelect(
  interaction: any,
  client:      CassieClient,
): Promise<void> {
  const messageId = interaction.message?.id as string | undefined;
  const session    = messageId ? unbanSessions.get(messageId) : undefined;

  if (!session) {
    await interaction.reply({ content: 'This session has expired.', flags: MessageFlags.Ephemeral })
      .catch((): null => null);
    return;
  }

  if (interaction.user.id !== session.invokerUserId) {
    await interaction.reply({
      content: 'Only the person who ran this command can use this menu.',
      flags: MessageFlags.Ephemeral,
    }).catch((): null => null);
    return;
  }

  await interaction.deferUpdate().catch((): null => null);

  const selectedIds: string[] = interaction.values as string[];
  const guild = interaction.guild;
  const reason = 'None provided.';

  const results: { username: string; failed: boolean }[] = [];

  for (const userId of selectedIds) {
    const banEntry = await guild.bans.fetch(userId).catch((): null => null);
    if (!banEntry) {
      results.push({ username: userId, failed: true });
      continue;
    }

    const unbanned = await guild.bans.remove(userId, reason).then(() => true).catch((err: any) => {
      console.error(`[unban:bulk] failed to unban ${userId}: ${err?.message ?? err}`);
      return false;
    });
    if (!unbanned) {
      results.push({ username: banEntry.user.username, failed: true });
      continue;
    }

    try {
      const dm = await banEntry.user.createDM();
      await dm.send(buildUnbanDmPayload(guild.name, reason, interaction.user.username));
    } catch { /* DMs closed or no mutual server */ }

    sendModLog(client, guild.id, buildModLogUnban(banEntry.user, reason, interaction.user.username));
    results.push({ username: banEntry.user.username, failed: false });
  }

  unbanSessions.delete(messageId!);

  await interaction.editReply(buildUnbanResultPayload(results)).catch((): null => null);
}
