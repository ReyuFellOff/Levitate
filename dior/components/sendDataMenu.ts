// xoxo/components/sendDataMenu.ts
//
// Session tracking, payload builder, and interaction handlers for $send-data.
//
// Behaviour:
//   • Shows the same dropdown listing as $view-data.
//   • When the user selects an item the dropdown message is deleted and the
//     selected data is sent directly to the channel — no persistent panel.
//   • Prev / Next pagination works identically to $view-data.
//
// customId routing in interactionCreate.ts (prefix: 'senddata'):
//   StringSelectMenu → 'senddata:select'
//   Button           → 'senddata:prev' | 'senddata:next'

import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  MessageFlags,
  SeparatorBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  TextDisplayBuilder,
} from 'discord.js';
import type { LevitateClient } from '../structures/LevitateClient.js';
import type { SavedDataDoc } from '../database/database.js';
import { resolvePlaceholders } from '../helpers/placeholders.js';
import { emojis } from '../emojis.js';

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const INACTIVITY_MS = 5 * 60 * 1_000;
const PAGE_SIZE     = 25;

// ─────────────────────────────────────────────────────────────────────────────
// Session tracking
// ─────────────────────────────────────────────────────────────────────────────

export interface SendDataSession {
  userId:    string;
  guildId:   string;
  channelId: string;
  items:     SavedDataDoc[];
  page:      number;
  client:    LevitateClient;
}

export const sendDataSessions = new Map<string, SendDataSession>();
const sendDataTimeouts         = new Map<string, NodeJS.Timeout>();

export function registerSendDataSession(messageId: string, session: SendDataSession): void {
  sendDataSessions.set(messageId, session);
  resetSendDataTimeout(messageId);
}

export function resetSendDataTimeout(messageId: string): void {
  const session = sendDataSessions.get(messageId);
  if (!session) return;

  clearTimeout(sendDataTimeouts.get(messageId));

  const timeout = setTimeout(async () => {
    try {
      const channel = await session.client.channels.fetch(session.channelId);
      const msg     = await (channel as any).messages.fetch(messageId);
      await msg.edit(buildSendDataPayload(session.items, session.page, true));
    } catch {
      // Message deleted or inaccessible — silently ignore
    } finally {
      sendDataSessions.delete(messageId);
      sendDataTimeouts.delete(messageId);
    }
  }, INACTIVITY_MS);

  sendDataTimeouts.set(messageId, timeout);
}

// ─────────────────────────────────────────────────────────────────────────────
// Payload builder
// ─────────────────────────────────────────────────────────────────────────────

const TYPE_LABEL: Record<string, string> = {
  message: 'Message',
  embed:   'Embed',
  cv2:     'CV2',
};

export function buildSendDataPayload(
  items:    SavedDataDoc[],
  page:     number,
  disabled = false,
): any {
  const totalPages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  const safePage   = Math.min(Math.max(page, 0), totalPages - 1);
  const pageItems  = items.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);

  const selectOptions = pageItems.map((item) =>
    new StringSelectMenuOptionBuilder()
      .setValue(item.name)
      .setLabel(item.name.length > 100 ? item.name.slice(0, 97) + '…' : item.name)
      .setDescription(`Type: ${TYPE_LABEL[item.type] ?? item.type}`)
      .setEmoji({ id: '1494806795217014887', name: 'blackCards' }),
  );

  const menu = new StringSelectMenuBuilder()
    .setCustomId('senddata:select')
    .setPlaceholder(
      totalPages > 1
        ? `Page ${safePage + 1}/${totalPages} — select an item to send it.`
        : 'Select an item to send it.',
    )
    .addOptions(selectOptions)
    .setDisabled(disabled);

  const prevBtn = new ButtonBuilder()
    .setCustomId('senddata:prev')
    .setLabel('← Prev')
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(disabled || safePage === 0);

  const nextBtn = new ButtonBuilder()
    .setCustomId('senddata:next')
    .setLabel('Next →')
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(disabled || safePage >= totalPages - 1);

  const pageBtn = new ButtonBuilder()
    .setCustomId('senddata:noop')
    .setLabel(`${safePage + 1} / ${totalPages}`)
    .setStyle(ButtonStyle.Primary)
    .setDisabled(true);

  const start     = safePage * PAGE_SIZE + 1;
  const end       = Math.min((safePage + 1) * PAGE_SIZE, items.length);
  const countLine = items.length === 1
    ? `${emojis.whiteCards} **1 item** saved in this server.`
    : `${emojis.whiteCards} **${items.length} items** saved in this server. *(showing ${start}–${end})*`;

  const footerLine = disabled
    ? '-# This session has timed out. Run `$send-data` again.'
    : '-# Select an item — the panel will be removed and the item sent directly.';

  const container = new ContainerBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`## ${emojis.whiteCards} Send Saved Data`),
    )
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(countLine),
    )
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
    .addActionRowComponents(
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu) as any,
    );

  if (totalPages > 1) {
    container.addActionRowComponents(
      new ActionRowBuilder<ButtonBuilder>().addComponents(prevBtn, pageBtn, nextBtn),
    );
  }

  container
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(footerLine),
    );

  return {
    components: [container],
    flags: MessageFlags.IsComponentsV2,
    allowedMentions: { parse: [] },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Session guard
// ─────────────────────────────────────────────────────────────────────────────

async function resolveSendSession(
  interaction: any,
): Promise<{ session: SendDataSession; messageId: string } | null> {
  const messageId: string = interaction.message?.id ?? '';
  const session = sendDataSessions.get(messageId);

  if (!session) {
    await interaction.reply({
      content: 'This session has expired. Run `$send-data` again.',
      flags: MessageFlags.Ephemeral,
    }).catch((): null => null);
    return null;
  }

  if (interaction.user.id !== session.userId) {
    await interaction.reply({
      content: 'Only the person who ran this command can use this menu.',
      flags: MessageFlags.Ephemeral,
    }).catch((): null => null);
    return null;
  }

  return { session, messageId };
}

// ─────────────────────────────────────────────────────────────────────────────
// Interaction handlers
// ─────────────────────────────────────────────────────────────────────────────

/** Prev / Next pagination buttons. */
export async function handleSendDataPage(
  interaction: any,
  direction: -1 | 1,
  _client: LevitateClient,
): Promise<void> {
  const resolved = await resolveSendSession(interaction);
  if (!resolved) return;

  const { session, messageId } = resolved;
  const totalPages = Math.max(1, Math.ceil(session.items.length / PAGE_SIZE));
  session.page     = Math.min(Math.max(session.page + direction, 0), totalPages - 1);

  await interaction.update(buildSendDataPayload(session.items, session.page))
    .catch((): null => null);
  resetSendDataTimeout(messageId);
}

/** User selected an item — delete the panel, send the data directly. */
export async function handleSendDataSelect(
  interaction: any,
  client: LevitateClient,
): Promise<void> {
  const resolved = await resolveSendSession(interaction);
  if (!resolved) return;

  const { session, messageId } = resolved;
  const selectedName: string   = interaction.values[0] ?? '';

  // Clean up the session immediately so no further interactions fire
  clearTimeout(sendDataTimeouts.get(messageId));
  sendDataSessions.delete(messageId);
  sendDataTimeouts.delete(messageId);

  await interaction.deferUpdate().catch((): null => null);

  // Fetch the DB entry
  const entry = await client.db.getSavedData(session.guildId, selectedName)
    .catch((): null => null);

  if (!entry) {
    await interaction.followUp({
      content: `${emojis.redcross} Could not find \`${selectedName}\` in the database.`,
      flags: MessageFlags.Ephemeral,
    }).catch((): null => null);
    return;
  }

  // Fetch the stored payload from the storage channel
  const storageChannelId: string = (client.config as any).savedDataChannelId ?? '';
  const storageChannel: any = storageChannelId
    ? (client.channels.cache.get(storageChannelId) ??
       await client.channels.fetch(storageChannelId).catch((): null => null))
    : null;

  if (!storageChannel) {
    await interaction.followUp({
      content: `${emojis.redcross} Cannot reach the storage channel.`,
      flags: MessageFlags.Ephemeral,
    }).catch((): null => null);
    return;
  }

  const storageMsg: any = await storageChannel.messages
    .fetch(entry.message_id)
    .catch((): null => null);

  if (!storageMsg) {
    await interaction.followUp({
      content: `${emojis.redcross} The storage message for \`${selectedName}\` no longer exists.`,
      flags: MessageFlags.Ephemeral,
    }).catch((): null => null);
    return;
  }

  const fileAttachment = storageMsg.attachments?.first?.();
  if (!fileAttachment) {
    await interaction.followUp({
      content: `${emojis.redcross} No file attachment found on the storage message for \`${selectedName}\`.`,
      flags: MessageFlags.Ephemeral,
    }).catch((): null => null);
    return;
  }

  let rawContent: string;
  try {
    const res = await fetch(fileAttachment.url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    rawContent = (await res.text()).trim();
  } catch (err: any) {
    await interaction.followUp({
      content: `${emojis.redcross} Failed to download the stored file: \`${err.message}\``,
      flags: MessageFlags.Ephemeral,
    }).catch((): null => null);
    return;
  }

  if (!rawContent) {
    await interaction.followUp({
      content: `${emojis.redcross} The stored file for \`${selectedName}\` is empty.`,
      flags: MessageFlags.Ephemeral,
    }).catch((): null => null);
    return;
  }

  const placeholderCtx = {
    user:    interaction.user,
    member:  interaction.member   ?? null,
    channel: interaction.channel  ?? null,
    guild:   interaction.guild    ?? null,
    client,
  };
  const resolvedText = resolvePlaceholders(rawContent, placeholderCtx);

  const targetChannel: any = interaction.channel;
  let sendErr: string | null = null;

  if (entry.type === 'message') {
    let remaining = resolvedText;
    while (remaining.length > 0 && !sendErr) {
      const chunk = remaining.slice(0, 2000);
      remaining   = remaining.slice(2000);
      const sent  = await targetChannel.send({
        content: chunk,
        allowedMentions: { parse: [] },
      }).catch((): null => null);
      if (!sent) sendErr = 'Failed to send the message content.';
    }
  } else if (entry.type === 'embed') {
    let parsed: any;
    try { parsed = JSON.parse(resolvedText); }
    catch (err: any) { sendErr = `Invalid embed JSON: \`${err.message}\``; }
    if (!sendErr) {
      const embeds = Array.isArray(parsed) ? parsed : (parsed?.embeds ?? [parsed]);
      const payload: any = { embeds, allowedMentions: { parse: [] } };
      if (parsed?.content) payload.content = parsed.content;
      if (!Array.isArray(parsed) && Array.isArray(parsed?.components) && parsed.components.length > 0) {
        payload.components = parsed.components;
      }
      const sent = await targetChannel.send(payload).catch((): null => null);
      if (!sent) sendErr = 'Discord rejected the embed payload.';
    }
  } else if (entry.type === 'cv2') {
    let parsed: any;
    try { parsed = JSON.parse(resolvedText); }
    catch (err: any) { sendErr = `Invalid CV2 JSON: \`${err.message}\``; }
    if (!sendErr) {
      const components = Array.isArray(parsed) ? parsed : [parsed];
      const sent = await targetChannel.send({
        components,
        flags: MessageFlags.IsComponentsV2,
        allowedMentions: { parse: [] },
      }).catch((): null => null);
      if (!sent) sendErr = 'Discord rejected the CV2 payload.';
    }
  }

  if (sendErr) {
    await interaction.followUp({
      content: `${emojis.redcross} ${sendErr}`,
      flags: MessageFlags.Ephemeral,
    }).catch((): null => null);
    return;
  }

  // Delete the dropdown panel
  await interaction.message?.delete().catch((): null => null);
}
