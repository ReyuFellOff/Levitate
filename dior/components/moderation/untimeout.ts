import { config } from '../../config.js';
// xoxo/components/moderation/untimeout.ts
//
// CV2 payloads and interaction handler for the untimeout command.
// Handles the multi-select "pick who to untimeout" panel and its result.

import {
  ActionRowBuilder,
  ContainerBuilder,
  SeparatorBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  TextDisplayBuilder,
  MessageFlags,
} from 'discord.js';
import type { LevitateClient } from '../../structures/LevitateClient.js';
import { emojis } from '../../emojis.js';
import { buildTimeoutRemoveDmPayload } from './timeout.js';
import { buildModLogUnTimeout } from './modlog.js';
import { sendModLog } from '../../utils/modlogHelper.js';

// ─────────────────────────────────────────────────────────────────────────────
// Session store
// ─────────────────────────────────────────────────────────────────────────────

interface UnTimeoutSession {
  invokerUserId: string;
  guildId:       string;
}

export const untimeoutSessions = new Map<string, UnTimeoutSession>();

const SESSION_TTL_MS = 3 * 60 * 1_000; // 3 minutes

export function registerUnTimeoutSession(
  messageId:     string,
  invokerUserId: string,
  guildId:       string,
): void {
  untimeoutSessions.set(messageId, { invokerUserId, guildId });
  setTimeout(() => untimeoutSessions.delete(messageId), SESSION_TTL_MS);
}

// ─────────────────────────────────────────────────────────────────────────────
// List panel — shown when no user argument is supplied
// ─────────────────────────────────────────────────────────────────────────────

export interface TimedOutEntry {
  userId:    string;
  username:  string;
  expiresAt: Date;
}

export function buildUnTimeoutListPayload(entries: TimedOutEntry[]): any {
  const listText = entries
    .map(e => {
      const expSec = Math.floor(e.expiresAt.getTime() / 1000);
      return `${emojis.glowyWhiteArrow} **${e.username}** — expires <t:${expSec}:R>`;
    })
    .join('\n');

  const maxSelect = Math.min(entries.length, 25);

  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId('untimeout:select')
    .setPlaceholder('Select members to untimeout…')
    .setMinValues(1)
    .setMaxValues(maxSelect)
    .addOptions(
      entries.slice(0, 25).map(e => {
        const expSec = Math.floor(e.expiresAt.getTime() / 1000);
        return new StringSelectMenuOptionBuilder()
          .setLabel(e.username.slice(0, 100))
          .setValue(e.userId)
          .setDescription(`Expires <t:${expSec}:R>`.slice(0, 100));
      }),
    );

  const actionRow = new ActionRowBuilder().addComponents(selectMenu);

  const container = new ContainerBuilder().setAccentColor(parseInt(config.defaultAccentColor.replace('#', ''), 16))
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`## ${emojis.clock} Timed Out Members`),
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

export function buildUnTimeoutResultPayload(
  results: { username: string; dmSent: boolean; failed: boolean }[],
): any {
  const lines = results.map(r => {
    if (r.failed) return `- **${r.username}** — failed to remove timeout`;
    const notify = r.dmSent ? 'Notified: Yes' : 'Notified: No';
    return `- **${r.username}** — ${notify}`;
  });

  const container = new ContainerBuilder().setAccentColor(parseInt(config.defaultAccentColor.replace('#', ''), 16))
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`## ${emojis.greentick} Timeout${results.length === 1 ? '' : 's'} Removed`),
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
// Interaction handler — called from interactionCreate for 'untimeout:select'
// ─────────────────────────────────────────────────────────────────────────────

export async function handleUnTimeoutSelect(
  interaction: any,
  client:      LevitateClient,
): Promise<void> {
  const messageId = interaction.message?.id as string | undefined;
  const session   = messageId ? untimeoutSessions.get(messageId) : undefined;

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

  const results: { username: string; dmSent: boolean; failed: boolean }[] = [];

  for (const userId of selectedIds) {
    const member = await guild.members.fetch(userId).catch((): null => null);
    if (!member) {
      results.push({ username: userId, dmSent: false, failed: true });
      continue;
    }

    const removed = await member.timeout(null, reason).catch((err: any): null => {
      console.error(`[untimeout:bulk] failed to remove timeout from ${userId}: ${err?.message ?? err}`);
      return null;
    });
    if (!removed) {
      results.push({ username: member.user.username, dmSent: false, failed: true });
      continue;
    }

    let dmSent = false;
    try {
      const dm = await member.user.createDM();
      await dm.send(buildTimeoutRemoveDmPayload(guild.name, reason, interaction.user.username));
      dmSent = true;
    } catch { /* DMs closed */ }

    sendModLog(client, guild.id, buildModLogUnTimeout(member.user, reason, interaction.user.username));
    results.push({ username: member.user.username, dmSent, failed: false });
  }

  untimeoutSessions.delete(messageId!);

  await interaction.editReply(buildUnTimeoutResultPayload(results)).catch((): null => null);
}
