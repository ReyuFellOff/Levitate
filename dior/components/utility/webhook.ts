import { config } from '../../config.js';
// xoxo/components/utility/webhook.ts
//
// Interactive Webhook Manager ("$webhook"). Entry point: startWebhookSession()
//
// Lets a server manager create, inspect, rename, re-avatar, relocate, delete,
// and send messages through native Discord webhooks — all from one live panel.
//
// Flow:
//   Home     → select an existing webhook, or "Create Webhook"
//   Create   → pick a channel → modal (name + optional avatar URL) → created
//   Manage   → Send / Rename / Avatar / Move Channel / Delete / Back
//
// ── Interaction-failed safety ────────────────────────────────────────────────
// Every interaction is acknowledged (deferUpdate / showModal / update) BEFORE
// any async work (DB calls, webhook API calls). This keeps us well within the
// 3-second Discord window.
//
// ── Triple-send fix ──────────────────────────────────────────────────────────
// A per-session `busy` flag prevents concurrent modal flows. When a modal is
// already open, any further button clicks are immediately deferUpdate'd (so
// Discord never shows "interaction failed") and silently dropped. This ensures
// exactly one awaitModal listener is ever registered per session at a time.

import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelSelectMenuBuilder,
  ChannelType,
  ContainerBuilder,
  MessageFlags,
  ModalBuilder,
  SectionBuilder,
  SeparatorBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  TextDisplayBuilder,
  TextInputBuilder,
  TextInputStyle,
  ThumbnailBuilder,
} from 'discord.js';
import type { CassieClient } from '../../structures/CassieClient.js';
import { emojis } from '../../emojis.js';
import { authorOnlyFilter } from '../../helpers/panelGuard.js';

const SESSION_MS = 30 * 60_000;
const MODAL_MS   = 120_000;
const MAX_LISTED = 25; // Discord select menu option cap

function wrap(container: ContainerBuilder): any {
  return {
    components:      [container],
    flags:           MessageFlags.IsComponentsV2,
    allowedMentions: { parse: [] },
  };
}

function isValidUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

/** Safe field extractor for modal submissions. */
function tv(fields: any, id: string): string {
  try { return (fields.getTextInputValue(id) ?? '').trim(); }
  catch { return ''; }
}

// ─────────────────────────────────────────────────────────────────────────────
// Fetching
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Webhooks without a visible `token` (channel-follower/news webhooks, or ones
 * this bot otherwise can't manage) are intentionally excluded from the
 * manageable list below since they can't be edited/deleted/sent through here.
 * We still count them so the Home panel can say "N more can't be managed
 * here" instead of silently making them look missing.
 */
async function fetchWebhookState(guild: any): Promise<{ webhooks: any[]; hiddenCount: number }> {
  const coll = await guild.fetchWebhooks().catch((err: any): null => {
    console.error(`[webhook] fetchWebhooks failed for guild ${guild?.id}: ${err?.message ?? err}`);
    return null;
  });
  if (!coll) return { webhooks: [], hiddenCount: 0 };

  const all         = [...coll.values()];
  const manageable  = all.filter((w: any) => w.channelId != null && w.token !== undefined);
  return { webhooks: manageable, hiddenCount: all.length - manageable.length };
}

/** Fetches the manageable webhook list and updates both `s.webhooks` and `s.hiddenCount`. */
async function refreshWebhooks(s: Session, guild: any): Promise<void> {
  const state = await fetchWebhookState(guild);
  s.webhooks    = state.webhooks;
  s.hiddenCount = state.hiddenCount;
}

// ─────────────────────────────────────────────────────────────────────────────
// Session state
// ─────────────────────────────────────────────────────────────────────────────

type Mode = 'home' | 'create_channel' | 'manage' | 'delete_confirm' | 'send_data';

interface Session {
  authorId: string;
  guild:    any;
  client:   CassieClient;
  mode:     Mode;
  webhooks: any[];
  /** Count of guild webhooks that exist but can't be managed here (see `fetchWebhookState`). */
  hiddenCount: number;
  selected: any | null;
  status:   string | null;
  /**
   * Prevents concurrent modal flows. Set to true when a modal is open; any
   * further button/select clicks are immediately deferUpdate'd and dropped.
   * Always reset in a `finally` block so a crash can never lock the session.
   */
  busy: boolean;
  /** Cached saved-data list for the send_data picker. */
  savedDataItems: any[];
  /** Current page index in the send_data picker (24 items/page). */
  dataPage: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Payload builders
// ─────────────────────────────────────────────────────────────────────────────

function statusLine(s: Session): string {
  if (s.status) return s.status;
  switch (s.mode) {
    case 'create_channel': return '-# Pick the channel for the new webhook.';
    case 'manage':         return '-# Manage this webhook below, or go Back.';
    case 'delete_confirm': return '-# This cannot be undone — confirm or cancel.';
    default:               return '-# Select a webhook to manage, or create a new one.';
  }
}

function homePayload(s: Session): any {
  const container = new ContainerBuilder().setAccentColor(parseInt(config.defaultAccentColor.replace('#', ''), 16)).addTextDisplayComponents(
    new TextDisplayBuilder().setContent(`## ${emojis.info} Webhook Manager\n${statusLine(s)}`),
  );
  container.addSeparatorComponents(new SeparatorBuilder().setDivider(true));

  if (s.webhooks.length === 0) {
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        s.hiddenCount > 0
          ? `-# No manageable webhooks found. **${s.hiddenCount}** additional webhook${s.hiddenCount !== 1 ? 's' : ''} exist in this server but can't be managed here (e.g. channel-follower webhooks).`
          : '-# No webhooks found in this server (or I lack **Manage Webhooks** permission).',
      ),
    );
  } else {
    const listed = s.webhooks.slice(0, MAX_LISTED);
    container.addActionRowComponents(
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('wh:home:select')
          .setPlaceholder(
            `Select a webhook to manage… (${listed.length}${s.webhooks.length > MAX_LISTED ? '+' : ''})`,
          )
          .addOptions(
            listed.map((w: any) =>
              new StringSelectMenuOptionBuilder()
                .setLabel(w.name.slice(0, 100))
                .setValue(w.id)
                .setDescription(`#${w.channel?.name ?? 'unknown-channel'}`.slice(0, 100)),
            ),
          ),
      ),
    );
    if (s.hiddenCount > 0) {
      container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `-# **${s.hiddenCount}** additional webhook${s.hiddenCount !== 1 ? 's' : ''} exist in this server but can't be managed here (e.g. channel-follower webhooks).`,
        ),
      );
    }
  }

  container.addActionRowComponents(
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId('wh:home:create').setLabel('Create Webhook').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('wh:home:refresh').setLabel('Refresh').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('wh:home:close').setLabel('Close').setStyle(ButtonStyle.Danger),
    ),
  );

  return wrap(container);
}

function createChannelPayload(_s: Session): any {
  return wrap(
    new ContainerBuilder().setAccentColor(parseInt(config.defaultAccentColor.replace('#', ''), 16))
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(`## Create Webhook\n-# Pick the channel this webhook should post in.`),
      )
      .addActionRowComponents(
        new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(
          new ChannelSelectMenuBuilder()
            .setCustomId('wh:create:channel')
            .setPlaceholder('Choose a channel…')
            .setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement, ChannelType.GuildVoice),
        ),
      )
      .addActionRowComponents(
        new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder().setCustomId('wh:back').setLabel('Back').setStyle(ButtonStyle.Secondary),
        ),
      ),
  );
}

function managePayload(s: Session): any {
  const w   = s.selected;
  const txt =
    `## Managing: ${w.name}\n` +
    `**Channel:** <#${w.channelId}>\n` +
    `**ID:** \`${w.id}\`\n` +
    `${statusLine(s)}`;

  const container = new ContainerBuilder().setAccentColor(parseInt(config.defaultAccentColor.replace('#', ''), 16));
  if (w.avatarURL?.()) {
    container.addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(txt))
        .setThumbnailAccessory(new ThumbnailBuilder().setURL(w.avatarURL({ size: 256 }))),
    );
  } else {
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(txt));
  }

  container
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
    .addActionRowComponents(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId('wh:send').setLabel('Send Message').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('wh:senddata').setLabel('Send Saved Data').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('wh:rename').setLabel('Rename').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('wh:copylink').setLabel('Copy Webhook Link').setStyle(ButtonStyle.Secondary),
      ),
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId('wh:avatar').setLabel('Change Avatar').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('wh:move').setLabel('Move Channel').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('wh:delete').setLabel('Delete').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId('wh:back').setLabel('Back').setStyle(ButtonStyle.Secondary),
      ),
    );

  return wrap(container);
}

function moveChannelPayload(s: Session): any {
  return wrap(
    new ContainerBuilder().setAccentColor(parseInt(config.defaultAccentColor.replace('#', ''), 16))
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `## Move Webhook\n-# Pick the new channel for **${s.selected.name}**.`,
        ),
      )
      .addActionRowComponents(
        new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(
          new ChannelSelectMenuBuilder()
            .setCustomId('wh:move:channel')
            .setPlaceholder('Choose a channel…')
            .setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement, ChannelType.GuildVoice),
        ),
      )
      .addActionRowComponents(
        new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder().setCustomId('wh:back:manage').setLabel('Back').setStyle(ButtonStyle.Secondary),
        ),
      ),
  );
}

const DATA_PAGE_SIZE = 24; // leave 1 slot for nav sentinels

function sendDataPickerPayload(s: Session): any {
  const items     = s.savedDataItems;
  const totalPages = Math.max(1, Math.ceil(items.length / DATA_PAGE_SIZE));
  const p          = Math.min(Math.max(s.dataPage, 0), totalPages - 1);
  const slice      = items.slice(p * DATA_PAGE_SIZE, p * DATA_PAGE_SIZE + DATA_PAGE_SIZE);

  const container = new ContainerBuilder().setAccentColor(parseInt(config.defaultAccentColor.replace('#', ''), 16)).addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `## Send Saved Data via Webhook\n-# ${items.length} item(s) — Page ${p + 1}/${totalPages}`,
    ),
  );
  container.addSeparatorComponents(new SeparatorBuilder().setDivider(true));

  if (items.length === 0) {
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `-# No saved data found in this server. Use \`$create-data\` to save some first.`,
      ),
    );
  } else {
    const options: StringSelectMenuOptionBuilder[] = [];
    if (p > 0) {
      options.push(
        new StringSelectMenuOptionBuilder()
          .setLabel('← Previous page')
          .setValue('__prev__')
          .setDescription(`Page ${p} of ${totalPages}`),
      );
    }
    for (const item of slice) {
      options.push(
        new StringSelectMenuOptionBuilder()
          .setLabel(item.name.slice(0, 100))
          .setValue(item.name_lower)
          .setDescription(`Type: ${item.type}`),
      );
    }
    if (p < totalPages - 1) {
      options.push(
        new StringSelectMenuOptionBuilder()
          .setLabel('Next page →')
          .setValue('__next__')
          .setDescription(`Page ${p + 2} of ${totalPages}`),
      );
    }
    container.addActionRowComponents(
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('wh:data:select')
          .setPlaceholder('Choose saved data to send…')
          .addOptions(options),
      ),
    );
  }

  container.addActionRowComponents(
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId('wh:back:manage').setLabel('Back').setStyle(ButtonStyle.Secondary),
    ),
  );
  return wrap(container);
}

function deleteConfirmPayload(s: Session): any {
  return wrap(
    new ContainerBuilder().setAccentColor(parseInt(config.defaultAccentColor.replace('#', ''), 16)).addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `## Delete Webhook?\n` +
        `This will permanently delete **${s.selected.name}** from <#${s.selected.channelId}>.\n` +
        `-# This cannot be undone.`,
      ),
    ).addActionRowComponents(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId('wh:delete:confirm').setLabel('Yes, Delete').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId('wh:back:manage').setLabel('Cancel').setStyle(ButtonStyle.Secondary),
      ),
    ),
  );
}

function closedPayload(): any {
  return wrap(
    new ContainerBuilder().setAccentColor(parseInt(config.defaultAccentColor.replace('#', ''), 16)).addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`${emojis.greentick} Webhook manager closed.`),
    ),
  );
}

function payload(s: Session): any {
  switch (s.mode) {
    case 'create_channel': return createChannelPayload(s);
    case 'manage':         return managePayload(s);
    case 'delete_confirm': return deleteConfirmPayload(s);
    case 'send_data':      return sendDataPickerPayload(s);
    default:               return homePayload(s);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Modals
// ─────────────────────────────────────────────────────────────────────────────

function modalCreate(token: string, channelName: string): ModalBuilder {
  return new ModalBuilder()
    .setCustomId(`wh:modal:${token}:create`)
    .setTitle('Create Webhook')
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('name')
          .setLabel('Webhook Name')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(80)
          .setPlaceholder(`e.g. ${channelName}-relay`),
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('avatar')
          .setLabel('Avatar URL (optional)')
          .setStyle(TextInputStyle.Short)
          .setRequired(false)
          .setMaxLength(500),
      ),
    );
}

function modalRename(token: string, current: string): ModalBuilder {
  return new ModalBuilder()
    .setCustomId(`wh:modal:${token}:rename`)
    .setTitle('Rename Webhook')
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('name')
          .setLabel('New Name')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(80)
          .setValue(current),
      ),
    );
}

function modalAvatar(token: string, current: string | null): ModalBuilder {
  const input = new TextInputBuilder()
    .setCustomId('avatar')
    .setLabel('Avatar URL (leave blank to remove)')
    .setStyle(TextInputStyle.Short)
    .setRequired(false)
    .setMaxLength(500);
  if (current) input.setValue(current);
  return new ModalBuilder()
    .setCustomId(`wh:modal:${token}:avatar`)
    .setTitle('Change Avatar')
    .addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(input));
}

function modalSend(token: string): ModalBuilder {
  return new ModalBuilder()
    .setCustomId(`wh:modal:${token}:send`)
    .setTitle('Send via Webhook')
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('content')
          .setLabel('Message Content')
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(true)
          .setMaxLength(2000),
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('username')
          .setLabel('Override Username (optional)')
          .setStyle(TextInputStyle.Short)
          .setRequired(false)
          .setMaxLength(80),
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('avatar')
          .setLabel('Override Avatar URL (optional)')
          .setStyle(TextInputStyle.Short)
          .setRequired(false)
          .setMaxLength(500),
      ),
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// Local modal-submit awaiter
// ─────────────────────────────────────────────────────────────────────────────

function awaitModal(
  client:   CassieClient,
  customId: string,
  userId:   string,
  ms:       number,
): Promise<any | null> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      client.removeListener('interactionCreate', handler);
      resolve(null);
    }, ms);

    function handler(ix: any): void {
      if (ix.isModalSubmit?.() && ix.customId === customId && ix.user?.id === userId) {
        clearTimeout(timer);
        client.removeListener('interactionCreate', handler);
        resolve(ix);
      }
    }

    client.on('interactionCreate', handler);
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Modal helper — show modal, guard busy, await submit, call handler
//
// Returns true if the modal was shown+submitted successfully (handler called),
// false if busy / showModal failed / modal timed out. In all false cases the
// panel is already restored to its previous state via msg.edit().
// ─────────────────────────────────────────────────────────────────────────────

async function withModal(opts: {
  s:       Session;
  msg:     any;
  ix:      any;
  token:   string;
  kind:    'create' | 'rename' | 'avatar' | 'send';
  modal:   ModalBuilder;
  handler: (submit: any) => Promise<void>;
}): Promise<void> {
  const { s, msg, ix, token, kind, modal, handler } = opts;

  // ── Busy guard ─────────────────────────────────────────────────────────────
  if (s.busy) {
    // Acknowledge silently — user clicked while a modal was already open.
    await ix.deferUpdate().catch((): null => null);
    return;
  }

  s.busy = true;
  try {
    // showModal IS the acknowledgement for ix — it must be called first.
    const shown = await ix.showModal(modal).then((): true => true).catch((): false => false);
    if (!shown) {
      // showModal failed (rare — usually a stale token). Acknowledge via
      // deferUpdate so Discord doesn't show "Interaction failed", then show
      // an error status on the panel.
      await ix.deferUpdate().catch((): null => null);
      s.status = `${emojis.redcross} Couldn't open the dialog — please try again.`;
      await msg.edit(payload(s)).catch((): null => null);
      s.status = null;
      return;
    }

    const submit = await awaitModal(s.client, `wh:modal:${token}:${kind}`, s.authorId, MODAL_MS);
    if (!submit) {
      // Modal timed out — restore the panel to its current state with no error.
      await msg.edit(payload(s)).catch((): null => null);
      return;
    }

    await handler(submit);
  } finally {
    s.busy = false;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Saved-data resolver + webhook sender
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fetches the saved-data payload for `dataNameLower` in the session's guild,
 * then sends it through `s.selected` (the active webhook).
 * Returns a status string (success or error) to display in the manage panel.
 *
 * Supported types:
 *   message — sent as plain text content (chunked at 2000 chars if needed)
 *   embed   — sent as Discord embeds JSON
 *   cv2     — sent as a Components V2 message via the webhook execute API
 */
async function resolveAndSendSavedData(
  s:             Session,
  dataNameLower: string,
  client:        CassieClient,
): Promise<string> {
  if (!client.db) return `${emojis.redcross} Database is unavailable.`;

  const entry = await client.db.getSavedData(s.guild.id, dataNameLower).catch((): null => null);
  if (!entry) return `${emojis.redcross} Could not find that saved-data entry.`;

  // ── Fetch the file from the storage channel ────────────────────────────────
  const storageChannelId: string = (client.config as any).savedDataChannelId ?? '';
  const storageChannel: any = storageChannelId
    ? (client.channels.cache.get(storageChannelId) ??
       await client.channels.fetch(storageChannelId).catch((): null => null))
    : null;
  if (!storageChannel) return `${emojis.redcross} Cannot reach the saved-data storage channel.`;

  const storageMsg: any = await storageChannel.messages
    .fetch(entry.message_id)
    .catch((): null => null);
  if (!storageMsg) return `${emojis.redcross} Storage message for \`${entry.name}\` no longer exists.`;

  const attachment = storageMsg.attachments?.first?.();
  if (!attachment) return `${emojis.redcross} No file attachment found for \`${entry.name}\`.`;

  let raw: string;
  try {
    const res = await fetch(attachment.url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    raw = (await res.text()).trim();
  } catch (err: any) {
    return `${emojis.redcross} Failed to download the data file: \`${err.message}\``;
  }
  if (!raw) return `${emojis.redcross} The data file for \`${entry.name}\` is empty.`;

  // ── Send via webhook ───────────────────────────────────────────────────────
  if (entry.type === 'message') {
    let remaining = raw;
    while (remaining.length > 0) {
      const chunk = remaining.slice(0, 2000);
      remaining   = remaining.slice(2000);
      const ok = await s.selected.send({
        content:         chunk,
        allowedMentions: { parse: [] },
      }).catch((err: any): null => {
        console.error(`[webhook] senddata (message) failed via ${s.selected?.id}: ${err?.message ?? err}`);
        return null;
      });
      if (!ok) return `${emojis.redcross} Failed to send via webhook (chunk send error).`;
    }
    return `${emojis.greentick} **${entry.name}** sent via **${s.selected.name}**.`;
  }

  if (entry.type === 'embed') {
    let parsed: any;
    try { parsed = JSON.parse(raw); }
    catch (err: any) { return `${emojis.redcross} Invalid embed JSON: \`${err.message}\``; }

    const embeds  = Array.isArray(parsed) ? parsed : (parsed?.embeds ?? [parsed]);
    const wPayload: any = { embeds, allowedMentions: { parse: [] } };
    if (!Array.isArray(parsed) && parsed?.content) wPayload.content = parsed.content;

    const ok = await s.selected.send(wPayload).catch((err: any): null => {
      console.error(`[webhook] senddata (embed) failed via ${s.selected?.id}: ${err?.message ?? err}`);
      return null;
    });
    if (!ok) return `${emojis.redcross} Discord rejected the embed payload — check the embed structure.`;
    return `${emojis.greentick} **${entry.name}** sent via **${s.selected.name}**.`;
  }

  if (entry.type === 'cv2') {
    let parsed: any;
    try { parsed = JSON.parse(raw); }
    catch (err: any) { return `${emojis.redcross} Invalid CV2 JSON: \`${err.message}\``; }

    // Saved CV2 data is the raw ContainerBuilder.toJSON() (type 17) or an array.
    const components = Array.isArray(parsed) ? parsed : [parsed];
    const ok = await s.selected.send({
      components,
      flags:           MessageFlags.IsComponentsV2,
      allowedMentions: { parse: [] },
    }).catch((err: any): null => {
      console.error(`[webhook] senddata (cv2) failed via ${s.selected?.id}: ${err?.message ?? err}`);
      return null;
    });
    if (!ok) return `${emojis.redcross} Discord rejected the CV2 payload.`;
    return `${emojis.greentick} **${entry.name}** sent via **${s.selected.name}**.`;
  }

  return `${emojis.redcross} Unknown data type \`${entry.type}\`.`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Session entry point
// ─────────────────────────────────────────────────────────────────────────────

export async function startWebhookSession(
  message:  any,
  client:   CassieClient,
  authorId: string,
): Promise<void> {
  const guild = message.guild;
  const initialState = await fetchWebhookState(guild);

  const s: Session = {
    authorId,
    guild,
    client,
    mode:        'home',
    webhooks:    initialState.webhooks,
    hiddenCount: initialState.hiddenCount,
    selected: null,
    status:   null,
    busy:           false,
    savedDataItems: [],
    dataPage:       0,
  };

  const msg = await message.channel.send(payload(s)).catch((err: any): null => {
    console.error(`[webhook] failed to send panel: ${err?.message ?? err}`);
    return null;
  });
  if (!msg) return;

  const token = msg.id;

  const collector = msg.createMessageComponentCollector({
    filter: (ix: any) => authorOnlyFilter(ix, authorId),
    time:   SESSION_MS,
  });

  collector.on('collect', async (ix: any) => {
    const cid = ix.customId as string;
    s.status  = null; // clear previous status line on every new action

    try {
      // ── Navigation ──────────────────────────────────────────────────────────

      if (cid === 'wh:back') {
        s.mode = 'home';
        await ix.update(payload(s));
        return;
      }

      if (cid === 'wh:back:manage') {
        s.mode = 'manage';
        await ix.update(payload(s));
        return;
      }

      if (cid === 'wh:home:close') {
        collector.stop('closed');
        await ix.update(closedPayload()).catch((): null => null);
        return;
      }

      if (cid === 'wh:home:refresh') {
        await refreshWebhooks(s, guild);
        await ix.update(homePayload(s));
        return;
      }

      // ── Home: select webhook ─────────────────────────────────────────────

      if (cid === 'wh:home:select' && ix.isStringSelectMenu?.()) {
        const id = ix.values[0];
        let w = s.webhooks.find((x: any) => x.id === id) ?? null;
        if (!w) {
          // Webhook may have been deleted — re-fetch
          const fresh = await guild.fetchWebhooks().catch((): null => null);
          w = fresh?.get(id) ?? null;
        }
        if (!w) {
          s.status   = `${emojis.redcross} That webhook no longer exists — list refreshed.`;
          await refreshWebhooks(s, guild);
          await ix.update(homePayload(s));
          return;
        }
        s.selected = w;
        s.mode     = 'manage';
        await ix.update(managePayload(s));
        return;
      }

      // ── Create: go to channel picker ─────────────────────────────────────

      if (cid === 'wh:home:create') {
        s.mode = 'create_channel';
        await ix.update(createChannelPayload(s));
        return;
      }

      // ── Create: channel selected → open modal ────────────────────────────

      if (cid === 'wh:create:channel' && ix.isChannelSelectMenu?.()) {
        const channelId   = ix.channels.first()?.id;
        const channelName = guild.channels.cache.get(channelId)?.name ?? 'channel';

        await withModal({
          s, msg, ix, token,
          kind:  'create',
          modal: modalCreate(token, channelName),
          handler: async (submit) => {
            const name   = tv(submit.fields, 'name');
            const avatar = tv(submit.fields, 'avatar');

            if (avatar && !isValidUrl(avatar)) {
              await submit.reply({
                content: 'Invalid avatar URL — it must start with `http://` or `https://`.',
                flags:   MessageFlags.Ephemeral,
              }).catch((): null => null);
              // Restore create_channel mode so user can try again
              await msg.edit(createChannelPayload(s)).catch((): null => null);
              return;
            }

            // Ack the modal submit before the slow webhook API call
            await submit.deferUpdate().catch((): null => null);

            const created = await guild.channels.createWebhook({
              channel: channelId,
              name,
              avatar:  avatar || undefined,
              reason:  `Created by ${submit.user?.tag ?? authorId} via $webhook`,
            }).catch((err: any): null => {
              console.error(`[webhook] create failed: ${err?.message ?? err}`);
              return null;
            });

            if (!created) {
              s.status   = `${emojis.redcross} Failed to create the webhook — check my **Manage Webhooks** permission and the channel's webhook limit.`;
              s.mode     = 'home';
              await refreshWebhooks(s, guild);
              await msg.edit(homePayload(s)).catch((): null => null);
              return;
            }

            await refreshWebhooks(s, guild);
            s.selected = created;
            s.mode     = 'manage';
            s.status   = `${emojis.greentick} Webhook created in <#${channelId}>.`;
            await msg.edit(managePayload(s)).catch((): null => null);
          },
        });
        return;
      }

      // ── All manage actions require a selected webhook ────────────────────

      if (!s.selected) {
        s.mode = 'home';
        await ix.update(homePayload(s));
        return;
      }

      // ── Send Saved Data ───────────────────────────────────────────────────

      if (cid === 'wh:senddata') {
        // Ack immediately — listSavedData is async
        await ix.deferUpdate().catch((): null => null);
        s.savedDataItems = await (client.db?.listSavedData(guild.id).catch((): any[] => []) ?? Promise.resolve([]));
        s.dataPage = 0;
        s.mode = 'send_data';
        await msg.edit(sendDataPickerPayload(s)).catch((): null => null);
        return;
      }

      if (cid === 'wh:data:select' && ix.isStringSelectMenu?.()) {
        const value = ix.values[0];

        // Pagination sentinels — no async work, update immediately
        if (value === '__next__') { s.dataPage++; await ix.update(sendDataPickerPayload(s)); return; }
        if (value === '__prev__') { s.dataPage = Math.max(0, s.dataPage - 1); await ix.update(sendDataPickerPayload(s)); return; }

        // Real item selected — ack first, then do slow async resolution
        await ix.deferUpdate().catch((): null => null);
        s.status = await resolveAndSendSavedData(s, value, client);
        s.mode   = 'manage';
        await msg.edit(managePayload(s)).catch((): null => null);
        return;
      }

      // ── Send Message ─────────────────────────────────────────────────────

      if (cid === 'wh:send') {
        await withModal({
          s, msg, ix, token,
          kind:  'send',
          modal: modalSend(token),
          handler: async (submit) => {
            const content    = tv(submit.fields, 'content');
            const username   = tv(submit.fields, 'username');
            const avatarUrl  = tv(submit.fields, 'avatar');

            if (avatarUrl && !isValidUrl(avatarUrl)) {
              await submit.reply({
                content: 'Invalid avatar URL — it must start with `http://` or `https://`.',
                flags:   MessageFlags.Ephemeral,
              }).catch((): null => null);
              await msg.edit(managePayload(s)).catch((): null => null);
              return;
            }

            // Ack the modal submit BEFORE the webhook send call
            await submit.deferUpdate().catch((): null => null);

            const sent = await s.selected.send({
              content,
              username:         username    || undefined,
              avatarURL:        avatarUrl   || undefined,
              allowedMentions:  { parse: [] },
            }).catch((err: any): null => {
              console.error(`[webhook] send failed: ${err?.message ?? err}`);
              return null;
            });

            s.status = sent
              ? `${emojis.greentick} Message sent through **${s.selected.name}**.`
              : `${emojis.redcross} Failed to send — the webhook may have been deleted or the content is invalid.`;
            await msg.edit(managePayload(s)).catch((): null => null);
          },
        });
        return;
      }

      // ── Copy Webhook Link ────────────────────────────────────────────────
      // Discord has no clipboard API for bots, so the closest equivalent is
      // an ephemeral reply containing the raw URL in a code block for the
      // user to copy themselves.

      if (cid === 'wh:copylink') {
        const url = `https://discord.com/api/webhooks/${s.selected.id}/${s.selected.token}`;
        await ix.reply({
          content: `Webhook link for **${s.selected.name}**:\n\`\`\`${url}\`\`\``,
          flags:   MessageFlags.Ephemeral,
        }).catch((err: any): null => {
          console.error(`[webhook] copylink reply failed: ${err?.message ?? err}`);
          return null;
        });
        return;
      }

      // ── Rename ───────────────────────────────────────────────────────────

      if (cid === 'wh:rename') {
        await withModal({
          s, msg, ix, token,
          kind:  'rename',
          modal: modalRename(token, s.selected.name),
          handler: async (submit) => {
            const name = tv(submit.fields, 'name');
            if (!name) {
              await submit.reply({ content: 'Name cannot be empty.', flags: MessageFlags.Ephemeral })
                .catch((): null => null);
              await msg.edit(managePayload(s)).catch((): null => null);
              return;
            }

            await submit.deferUpdate().catch((): null => null);
            const updated = await s.selected.edit({ name }).catch((err: any): null => {
              console.error(`[webhook] rename failed: ${err?.message ?? err}`);
              return null;
            });
            if (updated) {
              s.selected = updated;
              await refreshWebhooks(s, guild);
              s.status   = `${emojis.greentick} Renamed to **${name}**.`;
            } else {
              s.status = `${emojis.redcross} Failed to rename the webhook — check the bot's console log for the exact Discord API error.`;
            }
            await msg.edit(managePayload(s)).catch((): null => null);
          },
        });
        return;
      }

      // ── Change Avatar ────────────────────────────────────────────────────

      if (cid === 'wh:avatar') {
        await withModal({
          s, msg, ix, token,
          kind:  'avatar',
          modal: modalAvatar(token, s.selected.avatarURL?.() ?? null),
          handler: async (submit) => {
            const avatar = tv(submit.fields, 'avatar');
            if (avatar && !isValidUrl(avatar)) {
              await submit.reply({
                content: 'Invalid avatar URL — it must start with `http://` or `https://`.',
                flags:   MessageFlags.Ephemeral,
              }).catch((): null => null);
              await msg.edit(managePayload(s)).catch((): null => null);
              return;
            }

            await submit.deferUpdate().catch((): null => null);
            const updated = await s.selected.edit({ avatar: avatar || null }).catch((err: any): null => {
              console.error(`[webhook] avatar update failed: ${err?.message ?? err}`);
              return null;
            });
            if (updated) {
              s.selected = updated;
              await refreshWebhooks(s, guild);
              s.status   = `${emojis.greentick} Avatar ${avatar ? 'updated' : 'removed'}.`;
            } else {
              s.status = `${emojis.redcross} Failed to update the avatar — check the bot's console log for the exact Discord API error.`;
            }
            await msg.edit(managePayload(s)).catch((): null => null);
          },
        });
        return;
      }

      // ── Move to different channel ─────────────────────────────────────────

      if (cid === 'wh:move') {
        await ix.update(moveChannelPayload(s));
        return;
      }

      if (cid === 'wh:move:channel' && ix.isChannelSelectMenu?.()) {
        const channel = ix.channels.first();
        // Ack immediately — webhook.edit() can be slow
        await ix.deferUpdate().catch((): null => null);

        const updated = await s.selected.edit({ channel: channel.id }).catch((err: any): null => {
          console.error(`[webhook] move failed: ${err?.message ?? err}`);
          return null;
        });
        if (updated) {
          s.selected = updated;
          s.status   = `${emojis.greentick} Moved to <#${channel.id}>.`;
        } else {
          s.status = `${emojis.redcross} Failed to move the webhook (do I have access to that channel?).`;
        }
        s.mode     = 'manage';
        await refreshWebhooks(s, guild);
        await msg.edit(managePayload(s)).catch((): null => null);
        return;
      }

      // ── Delete ────────────────────────────────────────────────────────────

      if (cid === 'wh:delete') {
        s.mode = 'delete_confirm';
        await ix.update(deleteConfirmPayload(s));
        return;
      }

      if (cid === 'wh:delete:confirm') {
        await ix.deferUpdate().catch((): null => null);
        const name = s.selected.name;
        const ok   = await s.selected
          .delete(`Deleted by ${ix.user?.tag ?? authorId} via $webhook`)
          .then((): true => true, (err: any): false => {
            console.error(`[webhook] delete failed: ${err?.message ?? err}`);
            return false;
          });
        s.selected = null;
        s.mode     = 'home';
        await refreshWebhooks(s, guild);
        s.status   = ok
          ? `${emojis.greentick} Deleted **${name}**.`
          : `${emojis.redcross} Failed to delete the webhook.`;
        await msg.edit(homePayload(s)).catch((): null => null);
        return;
      }

    } catch (err: any) {
      console.error(`[webhook] collector error on "${cid}": ${err?.message ?? err}`);
      // Best-effort acknowledgement to prevent "Interaction failed" in Discord
      try { await ix.deferUpdate(); } catch { /* already acknowledged */ }
    }
  });

  collector.on('end', (_collected: any, reason: string) => {
    if (reason !== 'time') return;
    msg.edit(wrap(
      new ContainerBuilder().setAccentColor(parseInt(config.defaultAccentColor.replace('#', ''), 16)).addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `-# This webhook session timed out. Run \`${client.config.prefix}webhook\` again to start a new one.`,
        ),
      ),
    )).catch((): null => null);
  });
}
