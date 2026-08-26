// xoxo/components/deleteDataMenu.ts
//
// Session tracking, payload builders, and interaction handlers for $delete-data.
//
// Flow:
//   1. $delete-data sends a panel with a StringSelectMenu (+ Prev/Next if >25 items).
//   2. User selects an item → message edits to a confirmation prompt.
//   3. User clicks Confirm → item deleted from DB → message edits to success, session ends.
//      User clicks Cancel  → message edits back to the dropdown panel.
//
// customId routing in interactionCreate.ts (prefix: 'deldata'):
//   StringSelectMenu → 'deldata:select'
//   Button           → 'deldata:prev' | 'deldata:next' | 'deldata:confirm' | 'deldata:cancel'

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
import type { CassieClient } from '../../structures/CassieClient.js';
import type { SavedDataDoc } from '../../database/database.js';
import { emojis } from '../../emojis.js';
import { config } from '../../config.js';

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const INACTIVITY_MS = 5 * 60 * 1_000;
const PAGE_SIZE     = 25;

// ─────────────────────────────────────────────────────────────────────────────
// Session
// ─────────────────────────────────────────────────────────────────────────────

export interface DeleteDataSession {
  userId:    string;
  guildId:   string;
  channelId: string;
  items:     SavedDataDoc[];
  page:      number;
  /** Name of the item currently awaiting confirmation, if any. */
  pending?:  string;
  client:    CassieClient;
}

export const deleteDataSessions = new Map<string, DeleteDataSession>();
const deleteDataTimeouts         = new Map<string, NodeJS.Timeout>();

export function registerDeleteDataSession(messageId: string, session: DeleteDataSession): void {
  deleteDataSessions.set(messageId, session);
  resetDeleteDataTimeout(messageId);
}

export function resetDeleteDataTimeout(messageId: string): void {
  const session = deleteDataSessions.get(messageId);
  if (!session) return;

  clearTimeout(deleteDataTimeouts.get(messageId));

  const timeout = setTimeout(async () => {
    try {
      const channel = await session.client.channels.fetch(session.channelId);
      const msg     = await (channel as any).messages.fetch(messageId);
      await msg.edit(buildDeleteDataPayload(session.items, session.page, 'timed-out'));
    } catch {
      // Message gone — ignore
    } finally {
      deleteDataSessions.delete(messageId);
      deleteDataTimeouts.delete(messageId);
    }
  }, INACTIVITY_MS);

  deleteDataTimeouts.set(messageId, timeout);
}

// ─────────────────────────────────────────────────────────────────────────────
// Payload builders
// ─────────────────────────────────────────────────────────────────────────────

const TYPE_LABEL: Record<string, string> = {
  message: 'Message',
  embed:   'Embed',
  cv2:     'CV2',
};

/**
 * Builds the list panel with the StringSelectMenu (+ optional pagination).
 *
 * @param items    Full list of saved items for the guild.
 * @param page     Current 0-based page index.
 * @param mode     'select' = active, 'timed-out' = disabled/expired.
 */
export function buildDeleteDataPayload(
  items:   SavedDataDoc[],
  page:    number,
  mode:    'select' | 'timed-out',
): any {
  const disabled   = mode === 'timed-out';
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
    .setCustomId('deldata:select')
    .setPlaceholder(
      totalPages > 1
        ? `Page ${safePage + 1}/${totalPages} — select an item to delete it.`
        : 'Select an item to delete it.',
    )
    .addOptions(selectOptions)
    .setDisabled(disabled);

  const prevBtn = new ButtonBuilder()
    .setCustomId('deldata:prev')
    .setLabel('← Prev')
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(disabled || safePage === 0);

  const nextBtn = new ButtonBuilder()
    .setCustomId('deldata:next')
    .setLabel('Next →')
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(disabled || safePage >= totalPages - 1);

  const pageBtn = new ButtonBuilder()
    .setCustomId('deldata:noop')
    .setLabel(`${safePage + 1} / ${totalPages}`)
    .setStyle(ButtonStyle.Primary)
    .setDisabled(true);

  const start     = safePage * PAGE_SIZE + 1;
  const end       = Math.min((safePage + 1) * PAGE_SIZE, items.length);
  const countLine = items.length === 1
    ? `${emojis.blackCards} **1 item** saved in this server.`
    : `${emojis.blackCards} **${items.length} items** saved in this server. *(showing ${start}–${end})*`;

  const footerLine = disabled
    ? '-# This session has timed out. Run `$delete-data` again.'
    : '-# Select an item from the dropdown to delete it.';

  const container = new ContainerBuilder().setAccentColor(parseInt(config.defaultAccentColor.replace('#', ''), 16))
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`## ${emojis.blackCards} Delete Saved Data`),
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

/**
 * Builds the confirmation panel shown after the user picks an item to delete.
 */
function buildConfirmPayload(itemName: string, itemType: string, disabled = false): any {
  const typeLabel = TYPE_LABEL[itemType] ?? itemType;

  const container = new ContainerBuilder().setAccentColor(parseInt(config.defaultAccentColor.replace('#', ''), 16))
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`## ${emojis.blackCards} Confirm Deletion`),
    )
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `Are you sure you want to delete **\`${itemName}\`** *(${typeLabel})*?\n` +
        `-# This cannot be undone.`,
      ),
    )
    .addActionRowComponents(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId('deldata:confirm')
          .setLabel('Delete')
          .setStyle(ButtonStyle.Danger)
          .setDisabled(disabled),
        new ButtonBuilder()
          .setCustomId('deldata:cancel')
          .setLabel('Cancel')
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(disabled),
      ),
    )
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        disabled
          ? '-# This session has timed out.'
          : '-# You have 60 seconds to confirm.',
      ),
    );

  return {
    components: [container],
    flags: MessageFlags.IsComponentsV2,
    allowedMentions: { parse: [] },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared session guard
// ─────────────────────────────────────────────────────────────────────────────

async function resolveDeleteSession(
  interaction: any,
): Promise<{ session: DeleteDataSession; messageId: string } | null> {
  const messageId: string = interaction.message?.id ?? '';
  const session = deleteDataSessions.get(messageId);

  if (!session) {
    await interaction.reply({
      content: 'This session has expired. Run `$delete-data` again.',
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
export async function handleDeleteDataPage(
  interaction: any,
  direction: -1 | 1,
  _client: CassieClient,
): Promise<void> {
  const resolved = await resolveDeleteSession(interaction);
  if (!resolved) return;

  const { session, messageId } = resolved;
  const totalPages = Math.max(1, Math.ceil(session.items.length / PAGE_SIZE));
  session.page     = Math.min(Math.max(session.page + direction, 0), totalPages - 1);
  session.pending  = undefined;

  await interaction.update(buildDeleteDataPayload(session.items, session.page, 'select'))
    .catch((): null => null);
  resetDeleteDataTimeout(messageId);
}

/** User selected an item from the dropdown → show confirmation. */
export async function handleDeleteDataSelect(
  interaction: any,
  _client: CassieClient,
): Promise<void> {
  const resolved = await resolveDeleteSession(interaction);
  if (!resolved) return;

  const { session, messageId } = resolved;
  const selectedName: string   = interaction.values[0] ?? '';

  // Find the item to get its type for display
  const item = session.items.find((i) => i.name === selectedName);
  const itemType = item?.type ?? 'message';

  session.pending = selectedName;

  await interaction.update(buildConfirmPayload(selectedName, itemType)).catch((): null => null);
  resetDeleteDataTimeout(messageId);
}

/** User clicked Confirm — delete from DB, remove storage message, post to log channel. */
export async function handleDeleteDataConfirm(
  interaction: any,
  client: CassieClient,
): Promise<void> {
  const resolved = await resolveDeleteSession(interaction);
  if (!resolved) return;

  const { session, messageId } = resolved;
  const itemName = session.pending;

  if (!itemName) {
    await interaction.reply({
      content: 'Nothing to delete — select an item first.',
      flags: MessageFlags.Ephemeral,
    }).catch((): null => null);
    return;
  }

  // Capture item metadata before deletion (needed for log + storage cleanup)
  const item = session.items.find((i) => i.name === itemName);
  const itemType      = item?.type       ?? 'message';
  const itemMsgId     = item?.message_id ?? '';
  const itemCreatedAt = item?.created_at ?? null;

  await interaction.deferUpdate().catch((): null => null);

  const ok = await client.db.deleteSavedData(session.guildId, itemName)
    .catch((): boolean => false);

  if (!ok) {
    await interaction.followUp({
      content: `${emojis.redcross} Failed to delete \`${itemName}\` from the database.`,
      flags: MessageFlags.Ephemeral,
    }).catch((): null => null);
    return;
  }

  // Remove item from the session snapshot
  session.items   = session.items.filter((i) => i.name !== itemName);
  session.pending = undefined;

  // Clean up session — work is done
  clearTimeout(deleteDataTimeouts.get(messageId));
  deleteDataSessions.delete(messageId);
  deleteDataTimeouts.delete(messageId);

  // ── Fetch the stored file before deleting the storage message ──────────────
  const TYPE_LABEL_MAP: Record<string, string> = { message: 'Message', embed: 'Embed', cv2: 'CV2' };
  const typeLabel = TYPE_LABEL_MAP[itemType] ?? itemType;

  let fileBuffer: Buffer | null = null;
  let fileName: string = itemName;

  const savedChId = config.savedDataChannelId?.trim();
  let savedCh: any = null;

  if (savedChId && itemMsgId) {
    try {
      savedCh =
        client.channels.cache.get(savedChId) ??
        await client.channels.fetch(savedChId).catch((): null => null);

      if (savedCh) {
        const storageMsg: any = await savedCh.messages.fetch(itemMsgId).catch((): null => null);

        if (storageMsg) {
          // Download the file attachment for re-posting to the log channel
          const attachment = storageMsg.attachments?.first?.();
          if (attachment) {
            fileName = attachment.name ?? itemName;
            try {
              const res = await fetch(attachment.url);
              if (res.ok) {
                const buf = await res.arrayBuffer();
                fileBuffer = Buffer.from(buf);
              }
            } catch {
              // Best-effort
            }
          }

          // Delete the storage message
          await storageMsg.delete().catch((): null => null);
        }
      }
    } catch {
      // Best-effort — do not block the success flow
    }
  }

  // ── Log deletion to the deleted-data channel ────────────────────────────────
  const logChId = config.deletedDataChannelId?.trim();
  if (logChId) {
    try {
      const logCh: any =
        client.channels.cache.get(logChId) ??
        await client.channels.fetch(logChId).catch((): null => null);

      if (logCh) {
        const unixSec     = Math.floor(Date.now() / 1000);
        const createdSec  = itemCreatedAt ? Math.floor(new Date(itemCreatedAt).getTime() / 1000) : null;
        const createdLine = createdSec
          ? `**Created at:** <t:${createdSec}:F> (<t:${createdSec}:R>)\n`
          : '';
        const logText =
          `**Server:** ${interaction.guild?.name ?? 'Unknown'} (\`${session.guildId}\`)\n` +
          `**Deleted by:** ${interaction.user.tag ?? interaction.user.username} (<@${interaction.user.id}> \`${interaction.user.id}\`)\n` +
          `**Name:** \`${itemName}\`\n` +
          `**Type:** ${typeLabel}\n` +
          `${createdLine}` +
          `**Deleted at:** <t:${unixSec}:F> (<t:${unixSec}:R>)`;

        // Post metadata text + the original file attachment
        const { AttachmentBuilder } = await import('discord.js');
        const logPayload: any = { content: logText, allowedMentions: { parse: [] } };
        if (fileBuffer) {
          logPayload.files = [new AttachmentBuilder(fileBuffer, { name: fileName })];
        }
        await logCh.send(logPayload).catch((): null => null);

        // Post the divider
        await logCh.send({ content: config.dataDivider, allowedMentions: { parse: [] } })
          .catch((): null => null);
      }
    } catch {
      // Best-effort — do not block the success flow
    }
  }

  // Edit the message to a clean success state
  const successContainer = new ContainerBuilder().setAccentColor(parseInt(config.defaultAccentColor.replace('#', ''), 16))
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`## ${emojis.blackCards} Deleted`),
    )
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `${emojis.blacktick} Successfully deleted \`${itemName}\`.`,
      ),
    );

  await interaction.editReply({
    components: [successContainer],
    flags: MessageFlags.IsComponentsV2,
    allowedMentions: { parse: [] },
  }).catch((): null => null);
}

/** User clicked Cancel — return to the dropdown panel. */
export async function handleDeleteDataCancel(
  interaction: any,
  _client: CassieClient,
): Promise<void> {
  const resolved = await resolveDeleteSession(interaction);
  if (!resolved) return;

  const { session, messageId } = resolved;
  session.pending = undefined;

  await interaction.update(buildDeleteDataPayload(session.items, session.page, 'select'))
    .catch((): null => null);
  resetDeleteDataTimeout(messageId);
}
