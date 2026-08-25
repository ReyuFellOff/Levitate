// xoxo/components/utility/embed.ts
//
// Interactive live embed builder ("Embed Builder"). Entry point:
// startEmbedBuilderSession()
//
// Unlike the CV2 message builder (container.ts) which has an unbounded list
// of blocks, an embed has a fixed, definite set of parts — so this builder
// exposes one button per part instead of a block-select flow:
//   Basic Info  → title, description, hex color, url
//   Author      → name, icon url, url
//   Footer      → text, icon url
//   Images      → image url, thumbnail url
//   Fields      → add / edit / remove up to 25 name+value fields
// Plus Send (post to a channel) and Save as Data (reuse the shared
// saved-data storage system, same as $container's "Save as Data").
//
// Follows the same self-contained collector + modal-await pattern as
// xoxo/components/utility/container.ts — no global interactionCreate
// routing needed.

import {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelSelectMenuBuilder,
  ChannelType,
  ContainerBuilder,
  EmbedBuilder,
  MessageFlags,
  ModalBuilder,
  SeparatorBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  TextDisplayBuilder,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';
import type { CassieClient } from '../../structures/CassieClient.js';
import { config } from '../../config.js';
import { emojis } from '../../emojis.js';
import { sendError } from '../statusMessages.js';
import { authorOnlyFilter } from '../../helpers/panelGuard.js';
import { resolvePlaceholders, type PlaceholderContext } from '../../helpers/placeholders.js';

const SAVE_NAME_MAX = 50;
const MAX_FIELDS     = 25;
const MAX_BUTTONS    = 5; // Discord's limit for Link buttons in a single action row
const SESSION_MS     = 30 * 60_000;
/** Lavender — used whenever no color has been explicitly set. */
const DEFAULT_COLOR  = 0xB19CD9;

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface EmbedField {
  name:    string;
  value:   string;
  inline:  boolean;
}

interface EmbedLinkButton {
  label: string;
  url:   string;
  emoji: string | null;
}

interface EmbedState {
  title:       string | null;
  description: string | null;
  url:         string | null;
  color:       number | null;

  authorName: string | null;
  authorIcon: string | null;
  authorUrl:  string | null;

  footerText: string | null;
  footerIcon: string | null;

  image:     string | null;
  thumbnail: string | null;

  fields: EmbedField[];
  buttons: EmbedLinkButton[];
}

type BuilderMode = 'idle' | 'fields' | 'fieldEdit' | 'buttons' | 'send' | 'done' | 'loaddata';

interface BuilderSession {
  authorId:   string;
  placeholderContext: PlaceholderContext;
  embed:      EmbedState;
  mode:       BuilderMode;
  activeIdx:  number | null; // field being edited, if any
  client:     CassieClient;
  /** Guild saved-data entries of type 'embed', for the Load Data picker. */
  savedItems: any[];
  dataPage:   number;
}

function freshEmbed(): EmbedState {
  return {
    title: null,
    description: null,
    url: null,
    color: null,
    authorName: null,
    authorIcon: null,
    authorUrl: null,
    footerText: null,
    footerIcon: null,
    image: null,
    thumbnail: null,
    fields: [],
    buttons: [],
  };
}

function isEmpty(e: EmbedState): boolean {
  return !e.title && !e.description && !e.url && e.color === null
    && !e.authorName && !e.authorIcon && !e.authorUrl
    && !e.footerText && !e.footerIcon
    && !e.image && !e.thumbnail
    && e.fields.length === 0;
}

/** True when there is truly nothing to send — no embed content AND no buttons. */
function isFullyEmpty(e: EmbedState): boolean {
  return isEmpty(e) && e.buttons.length === 0;
}

// ─────────────────────────────────────────────────────────────────────────────
// Hex color parsing
// ─────────────────────────────────────────────────────────────────────────────

function parseHexColor(raw: string): number | null {
  const s = raw.trim().replace(/^#/, '');
  if (!/^[0-9a-fA-F]{6}$/.test(s)) return null;
  return parseInt(s, 16);
}

function colorToHex(color: number | null): string {
  if (color === null) return '';
  return `#${color.toString(16).padStart(6, '0')}`;
}

/** Only accept http(s) URLs — anything else is rejected before it ever reaches EmbedBuilder. */
function isValidUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Build the live EmbedBuilder from state
// ─────────────────────────────────────────────────────────────────────────────

function buildEmbed(e: EmbedState, placeholderContext?: PlaceholderContext): EmbedBuilder {
  const resolve = (value: string): string => placeholderContext
    ? resolvePlaceholders(value, placeholderContext)
    : value;
  const eb = new EmbedBuilder();
  const title = e.title ? resolve(e.title) : '';
  const description = e.description ? resolve(e.description) : '';
  const url = e.url ? resolve(e.url) : '';
  if (title) eb.setTitle(title.slice(0, 256));
  if (description) eb.setDescription(description.slice(0, 4096));
  if (url && title && isValidUrl(url)) eb.setURL(url); // Discord requires a title for the URL to render as a link
  eb.setColor(e.color !== null ? e.color : DEFAULT_COLOR); // always colored — lavender by default

  // Discord rejects an embed that has color but nothing else (empty form
  // body) — a zero-width-space description keeps it valid while still
  // looking visually empty.
  if (isEmpty(e)) eb.setDescription('\u200b');

  const authorName = e.authorName ? resolve(e.authorName) : '';
  const authorIcon = e.authorIcon ? resolve(e.authorIcon) : '';
  const authorUrl = e.authorUrl ? resolve(e.authorUrl) : '';
  if (authorName) {
    const author: { name: string; iconURL?: string; url?: string } = { name: authorName.slice(0, 256) };
    if (authorIcon && isValidUrl(authorIcon)) author.iconURL = authorIcon;
    if (authorUrl && isValidUrl(authorUrl)) author.url = authorUrl;
    eb.setAuthor(author);
  }

  const footerText = e.footerText ? resolve(e.footerText) : '';
  const footerIcon = e.footerIcon ? resolve(e.footerIcon) : '';
  if (footerText) {
    const footer: { text: string; iconURL?: string } = { text: footerText.slice(0, 2048) };
    if (footerIcon && isValidUrl(footerIcon)) footer.iconURL = footerIcon;
    eb.setFooter(footer);
  }

  const image = e.image ? resolve(e.image) : '';
  const thumbnail = e.thumbnail ? resolve(e.thumbnail) : '';
  if (image && isValidUrl(image)) eb.setImage(image);
  if (thumbnail && isValidUrl(thumbnail)) eb.setThumbnail(thumbnail);

  if (e.fields.length > 0) {
    eb.addFields(e.fields.map(f => ({
      name: resolve(f.name).slice(0, 256) || '\u200b',
      value: resolve(f.value).slice(0, 1024) || '\u200b',
      inline: f.inline,
    })));
  }

  return eb;
}

function buildRawEmbedJson(e: EmbedState): Record<string, any> {
  const embed: Record<string, any> = {
    color: e.color !== null ? e.color : DEFAULT_COLOR,
  };

  if (e.title) embed.title = e.title.slice(0, 256);
  if (e.description) embed.description = e.description.slice(0, 4096);
  if (e.url && e.title) embed.url = e.url;
  if (e.authorName) {
    embed.author = { name: e.authorName.slice(0, 256) };
    if (e.authorIcon) embed.author.icon_url = e.authorIcon;
    if (e.authorUrl) embed.author.url = e.authorUrl;
  }
  if (e.footerText) {
    embed.footer = { text: e.footerText.slice(0, 2048) };
    if (e.footerIcon) embed.footer.icon_url = e.footerIcon;
  }
  if (e.image) embed.image = { url: e.image };
  if (e.thumbnail) embed.thumbnail = { url: e.thumbnail };
  if (e.fields.length > 0) {
    embed.fields = e.fields.map((field) => ({
      name: field.name.slice(0, 256) || '\u200b',
      value: field.value.slice(0, 1024) || '\u200b',
      inline: field.inline,
    }));
  }

  return embed;
}

// ─────────────────────────────────────────────────────────────────────────────
// Control panels (plain action rows below the live embed — not CV2, since
// embeds and classic buttons/selects are what render together natively)
// ─────────────────────────────────────────────────────────────────────────────

function fieldLabel(f: EmbedField, i: number): string {
  const n = f.name.slice(0, 60).replace(/\n/g, ' ') || '(no name)';
  return `${i + 1}. ${n}`;
}

function fieldOptions(e: EmbedState): StringSelectMenuOptionBuilder[] {
  return e.fields.map((f, i) =>
    new StringSelectMenuOptionBuilder()
      .setLabel(fieldLabel(f, i).slice(0, 100))
      .setValue(String(i))
      .setDescription(f.value.slice(0, 90).replace(/\n/g, ' ') || '(no value)'),
  );
}

function ctrlIdle(s: BuilderSession): ActionRowBuilder<ButtonBuilder>[] {
  const e   = s.embed;
  const has = !isFullyEmpty(e);
  return [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId('eb:basic').setLabel('Basic Info').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('eb:author').setLabel('Author').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('eb:footer').setLabel('Footer').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('eb:images').setLabel('Images').setStyle(ButtonStyle.Secondary),
    ),
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId('eb:buttons').setLabel(`Buttons (${e.buttons.length}/${MAX_BUTTONS})`).setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('eb:send').setLabel('Send').setStyle(ButtonStyle.Success).setDisabled(!has),
      new ButtonBuilder().setCustomId('eb:savedata').setLabel('Save as Data').setStyle(ButtonStyle.Secondary).setDisabled(!has),
    ),
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId('eb:clear').setLabel('Clear All').setStyle(ButtonStyle.Danger).setDisabled(!has),
    ),
  ];
}

const LD_PAGE_SIZE = 24; // leave 1 slot for nav sentinels

function ctrlLoadData(s: BuilderSession): ActionRowBuilder<any>[] {
  const items      = s.savedItems;
  const totalPages = Math.max(1, Math.ceil(items.length / LD_PAGE_SIZE));
  const p          = Math.min(Math.max(s.dataPage, 0), totalPages - 1);
  const slice      = items.slice(p * LD_PAGE_SIZE, p * LD_PAGE_SIZE + LD_PAGE_SIZE);

  const options: StringSelectMenuOptionBuilder[] = [];
  if (p > 0) {
    options.push(
      new StringSelectMenuOptionBuilder()
        .setLabel('← Previous page').setValue('__prev__')
        .setDescription(`Page ${p} of ${totalPages}`),
    );
  }
  for (const item of slice) {
    options.push(
      new StringSelectMenuOptionBuilder()
        .setLabel(item.name.slice(0, 100)).setValue(item.name_lower)
        .setDescription('Embed · click to load into builder'),
    );
  }
  if (p < totalPages - 1) {
    options.push(
      new StringSelectMenuOptionBuilder()
        .setLabel('Next page →').setValue('__next__')
        .setDescription(`Page ${p + 2} of ${totalPages}`),
    );
  }

  const rows: ActionRowBuilder<any>[] = [
    new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('eb:loaddata_sel')
        .setPlaceholder(`Choose a saved embed… (${items.length} available, page ${p + 1}/${totalPages})`)
        .addOptions(options),
    ),
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId('eb:back').setLabel('Back').setStyle(ButtonStyle.Secondary),
    ),
  ];

  return rows;
}

function buttonLabel(b: EmbedLinkButton, i: number): string {
  return `${i + 1}. ${b.label.slice(0, 60) || '(no label)'}`;
}

function buttonOptions(e: EmbedState): StringSelectMenuOptionBuilder[] {
  return e.buttons.map((b, i) =>
    new StringSelectMenuOptionBuilder()
      .setLabel(buttonLabel(b, i).slice(0, 100))
      .setValue(String(i))
      .setDescription(b.url.slice(0, 90)),
  );
}

function ctrlButtons(e: EmbedState): ActionRowBuilder<any>[] {
  const rows: ActionRowBuilder<any>[] = [];
  const atMax = e.buttons.length >= MAX_BUTTONS;

  if (e.buttons.length > 0) {
    rows.push(
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('eb:button_edit_sel')
          .setPlaceholder('Edit a button…')
          .addOptions(...buttonOptions(e)),
      ),
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('eb:button_remove_sel')
          .setPlaceholder('Remove a button…')
          .addOptions(...buttonOptions(e)),
      ),
    );
  }

  rows.push(
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId('eb:button_add').setLabel('Add Button').setStyle(ButtonStyle.Primary).setDisabled(atMax),
      new ButtonBuilder().setCustomId('eb:back').setLabel('Back').setStyle(ButtonStyle.Secondary),
    ),
  );

  return rows;
}

/** Builds the live Link-button row shown under the embed preview, or null if there are none. */
function buildButtonsRow(e: EmbedState, placeholderContext?: PlaceholderContext): ActionRowBuilder<ButtonBuilder> | null {
  if (e.buttons.length === 0) return null;
  const resolve = (value: string): string => placeholderContext
    ? resolvePlaceholders(value, placeholderContext)
    : value;
  const row = new ActionRowBuilder<ButtonBuilder>();
  for (const b of e.buttons.slice(0, MAX_BUTTONS)) {
    const btn = new ButtonBuilder()
      .setStyle(ButtonStyle.Link)
      .setURL(resolve(b.url))
      .setLabel(resolve(b.label).slice(0, 80) || 'Link');
    if (b.emoji) btn.setEmoji(b.emoji);
    row.addComponents(btn);
  }
  return row;
}

function ctrlFields(e: EmbedState): ActionRowBuilder<any>[] {
  const rows: ActionRowBuilder<any>[] = [];
  const atMax = e.fields.length >= MAX_FIELDS;

  if (e.fields.length > 0) {
    rows.push(
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('eb:field_edit_sel')
          .setPlaceholder('Edit a field…')
          .addOptions(...fieldOptions(e)),
      ),
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('eb:field_remove_sel')
          .setPlaceholder('Remove a field…')
          .addOptions(...fieldOptions(e)),
      ),
    );
  }

  rows.push(
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId('eb:field_add').setLabel('Add Field').setStyle(ButtonStyle.Primary).setDisabled(atMax),
      new ButtonBuilder().setCustomId('eb:back').setLabel('Back').setStyle(ButtonStyle.Secondary),
    ),
  );

  return rows;
}

function ctrlSend(): ActionRowBuilder<any>[] {
  return [
    new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(
      new ChannelSelectMenuBuilder()
        .setCustomId('eb:channel_sel')
        .setPlaceholder('Choose a channel…')
        .setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement),
    ),
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId('eb:here').setLabel('Post Here').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('eb:back').setLabel('Cancel').setStyle(ButtonStyle.Secondary),
    ),
  ];
}

function ctrlDone(): ActionRowBuilder<ButtonBuilder>[] {
  return [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId('eb:clear').setLabel('Start a New One').setStyle(ButtonStyle.Secondary),
    ),
  ];
}

// ─────────────────────────────────────────────────────────────────────────────
// Full payload
// ─────────────────────────────────────────────────────────────────────────────

function statusLine(s: BuilderSession): string {
  switch (s.mode) {
    case 'fields':  return '-# Manage fields below, or go back.';
    case 'buttons': return '-# Manage link buttons below, or go back.';
    case 'send':    return '-# Pick a channel from the list, or post it right here.';
    case 'done':    return `${emojis.blacktick} Sent.`;
    default:        return isFullyEmpty(s.embed) ? '-# Nothing here yet — tap a button below to get started.' : '-# Live preview — edits below reflect instantly.';
  }
}

function payload(s: BuilderSession, expired = false, doneWhere?: string): any {
  if (expired) {
    return {
      content: `-# This session timed out. Run \`${s.client.config.prefix}embed\` again to start a new one.`,
      embeds: [],
      components: [],
      allowedMentions: { parse: [] },
    };
  }

  const eb = buildEmbed(s.embed, s.placeholderContext);
  const rows =
    s.mode === 'fields'   ? ctrlFields(s.embed) :
    s.mode === 'buttons'  ? ctrlButtons(s.embed) :
    s.mode === 'send'     ? ctrlSend() :
    s.mode === 'done'     ? ctrlDone() :
    s.mode === 'loaddata' ? ctrlLoadData(s) :
    ctrlIdle(s);

  // The live link-button preview rides along under whichever control rows
  // are showing, except while actively managing the button list itself
  // (ctrlButtons already surfaces them via the edit/remove select menus).
  const buttonRow = s.mode === 'buttons' ? null : buildButtonsRow(s.embed, s.placeholderContext);
  const allRows = buttonRow ? [...rows, buttonRow] : rows;

  const line = s.mode === 'done' && doneWhere
    ? `${emojis.blacktick} Sent to ${doneWhere}.`
    : statusLine(s);

  return {
    content: line,
    embeds: [eb],
    components: allRows,
    allowedMentions: { parse: [] },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Modals
// ─────────────────────────────────────────────────────────────────────────────

function modalBasic(token: string, e: EmbedState): ModalBuilder {
  const title = new TextInputBuilder()
    .setCustomId('title')
    .setLabel('Title')
    .setStyle(TextInputStyle.Short)
    .setRequired(false)
    .setMaxLength(256);
  if (e.title) title.setValue(e.title);

  const desc = new TextInputBuilder()
    .setCustomId('description')
    .setLabel('Description')
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(false)
    .setMaxLength(4000);
  if (e.description) desc.setValue(e.description);

  const color = new TextInputBuilder()
    .setCustomId('color')
    .setLabel('Hex Color')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('#5865F2')
    .setRequired(false)
    .setMaxLength(7);
  if (e.color !== null) color.setValue(colorToHex(e.color));

  const url = new TextInputBuilder()
    .setCustomId('url')
    .setLabel('Title URL (optional, needs a title)')
    .setStyle(TextInputStyle.Short)
    .setRequired(false)
    .setMaxLength(500);
  if (e.url) url.setValue(e.url);

  return new ModalBuilder()
    .setCustomId(`eb:modal:${token}:basic`)
    .setTitle('Basic Information')
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(title),
      new ActionRowBuilder<TextInputBuilder>().addComponents(desc),
      new ActionRowBuilder<TextInputBuilder>().addComponents(color),
      new ActionRowBuilder<TextInputBuilder>().addComponents(url),
    );
}

function modalAuthor(token: string, e: EmbedState): ModalBuilder {
  const name = new TextInputBuilder()
    .setCustomId('name')
    .setLabel('Author Name')
    .setStyle(TextInputStyle.Short)
    .setRequired(false)
    .setMaxLength(256);
  if (e.authorName) name.setValue(e.authorName);

  const icon = new TextInputBuilder()
    .setCustomId('icon')
    .setLabel('Author Icon URL')
    .setStyle(TextInputStyle.Short)
    .setRequired(false)
    .setMaxLength(500);
  if (e.authorIcon) icon.setValue(e.authorIcon);

  const url = new TextInputBuilder()
    .setCustomId('url')
    .setLabel('Author URL')
    .setStyle(TextInputStyle.Short)
    .setRequired(false)
    .setMaxLength(500);
  if (e.authorUrl) url.setValue(e.authorUrl);

  return new ModalBuilder()
    .setCustomId(`eb:modal:${token}:author`)
    .setTitle('Author')
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(name),
      new ActionRowBuilder<TextInputBuilder>().addComponents(icon),
      new ActionRowBuilder<TextInputBuilder>().addComponents(url),
    );
}

function modalFooter(token: string, e: EmbedState): ModalBuilder {
  const text = new TextInputBuilder()
    .setCustomId('text')
    .setLabel('Footer Text')
    .setStyle(TextInputStyle.Short)
    .setRequired(false)
    .setMaxLength(2048);
  if (e.footerText) text.setValue(e.footerText);

  const icon = new TextInputBuilder()
    .setCustomId('icon')
    .setLabel('Footer Icon URL')
    .setStyle(TextInputStyle.Short)
    .setRequired(false)
    .setMaxLength(500);
  if (e.footerIcon) icon.setValue(e.footerIcon);

  return new ModalBuilder()
    .setCustomId(`eb:modal:${token}:footer`)
    .setTitle('Footer')
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(text),
      new ActionRowBuilder<TextInputBuilder>().addComponents(icon),
    );
}

function modalImages(token: string, e: EmbedState): ModalBuilder {
  const image = new TextInputBuilder()
    .setCustomId('image')
    .setLabel('Image URL')
    .setStyle(TextInputStyle.Short)
    .setRequired(false)
    .setMaxLength(500);
  if (e.image) image.setValue(e.image);

  const thumb = new TextInputBuilder()
    .setCustomId('thumbnail')
    .setLabel('Thumbnail URL')
    .setStyle(TextInputStyle.Short)
    .setRequired(false)
    .setMaxLength(500);
  if (e.thumbnail) thumb.setValue(e.thumbnail);

  return new ModalBuilder()
    .setCustomId(`eb:modal:${token}:images`)
    .setTitle('Images')
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(image),
      new ActionRowBuilder<TextInputBuilder>().addComponents(thumb),
    );
}

function modalField(token: string, existing?: EmbedField): ModalBuilder {
  const name = new TextInputBuilder()
    .setCustomId('name')
    .setLabel('Field Name')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(256);
  if (existing?.name) name.setValue(existing.name);

  const value = new TextInputBuilder()
    .setCustomId('value')
    .setLabel('Field Value')
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(true)
    .setMaxLength(1024);
  if (existing?.value) value.setValue(existing.value);

  const inline = new TextInputBuilder()
    .setCustomId('inline')
    .setLabel('Inline? (yes / no)')
    .setStyle(TextInputStyle.Short)
    .setRequired(false)
    .setPlaceholder('yes')
    .setMaxLength(3);
  if (existing) inline.setValue(existing.inline ? 'yes' : 'no');

  return new ModalBuilder()
    .setCustomId(`eb:modal:${token}:field`)
    .setTitle(existing ? 'Edit Field' : 'Add Field')
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(name),
      new ActionRowBuilder<TextInputBuilder>().addComponents(value),
      new ActionRowBuilder<TextInputBuilder>().addComponents(inline),
    );
}

function modalButton(token: string, existing?: EmbedLinkButton): ModalBuilder {
  const label = new TextInputBuilder()
    .setCustomId('label')
    .setLabel('Button Label')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(80);
  if (existing?.label) label.setValue(existing.label);

  const url = new TextInputBuilder()
    .setCustomId('url')
    .setLabel('URL')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setPlaceholder('https://example.com')
    .setMaxLength(500);
  if (existing?.url) url.setValue(existing.url);

  const emoji = new TextInputBuilder()
    .setCustomId('emoji')
    .setLabel('Emoji (optional)')
    .setStyle(TextInputStyle.Short)
    .setRequired(false)
    .setPlaceholder('🔗')
    .setMaxLength(100);
  if (existing?.emoji) emoji.setValue(existing.emoji);

  return new ModalBuilder()
    .setCustomId(`eb:modal:${token}:button`)
    .setTitle(existing ? 'Edit Button' : 'Add Button')
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(label),
      new ActionRowBuilder<TextInputBuilder>().addComponents(url),
      new ActionRowBuilder<TextInputBuilder>().addComponents(emoji),
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// Modal field readers
// ─────────────────────────────────────────────────────────────────────────────

function tv(fields: any, id: string): string {
  try { return (fields.getTextInputValue(id) ?? '').trim(); }
  catch { return ''; }
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

// ─────────────────────────────────────────────────────────────────────────────
// awaitModal — identical pattern to container.ts / autoresponder.ts
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
// Emit the finished embed to a target channel
// ─────────────────────────────────────────────────────────────────────────────

async function emit(s: BuilderSession, target: any): Promise<boolean> {
  const eb = buildEmbed(s.embed);
  const buttonRow = buildButtonsRow(s.embed, s.placeholderContext);
  try {
    await target.send({
      embeds: [eb],
      components: buttonRow ? [buttonRow] : [],
      allowedMentions: { parse: [] },
    });
    return true;
  } catch {
    return false;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Save as Data — reuses the shared saved-data storage system (same as
// $container / $create-data / $view-data / $send-data).
// ─────────────────────────────────────────────────────────────────────────────

async function doSaveAsData(
  s:       BuilderSession,
  ix:      any,
  message: any,
  client:  CassieClient,
  token:   string,
): Promise<void> {
  const modalCid = `eb:modal:${token}:savename`;
  const modal = new ModalBuilder()
    .setCustomId(modalCid)
    .setTitle('Save as Data')
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('name')
          .setLabel('Name this saved data')
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('e.g. Welcome Embed')
          .setRequired(true)
          .setMaxLength(SAVE_NAME_MAX),
      ),
    );

  await ix.showModal(modal).catch((): null => null);

  const submit = await awaitModal(client, modalCid, s.authorId, 120_000);
  if (!submit) return;

  const name = tv(submit.fields, 'name');
  if (!name) {
    await submit.reply({ content: 'Name cannot be empty. Try **Save as Data** again.', flags: MessageFlags.Ephemeral }).catch((): null => null);
    return;
  }

  try {
    await submit.deferReply({ flags: MessageFlags.Ephemeral });
  } catch {
    await submit.reply({
      content: 'I could not acknowledge the save request. Please click **Save as Data** and try again.',
      flags: MessageFlags.Ephemeral,
    }).catch((): null => null);
    return;
  }

  try {
  const guildId = message.guild.id;

  let exists: boolean;
  try {
    exists = await withTimeout(client.db!.savedDataNameExists(guildId, name), 15_000, 'Database check');
  } catch {
    await submit.editReply({ content: 'Database error while checking name availability. Please try again.' }).catch((): null => null);
    return;
  }

  if (exists) {
    await submit.editReply({ content: `A saved item named \`${name}\` already exists in this server. Pick a different name.` }).catch((): null => null);
    return;
  }

  const storageChannelId = config.savedDataChannelId?.trim();
  const storageChannel: any = storageChannelId
    ? (client.channels.cache.get(storageChannelId) ??
      await withTimeout(client.channels.fetch(storageChannelId), 15_000, 'Storage channel lookup').catch((): null => null))
    : null;

  if (!storageChannel || typeof storageChannel.send !== 'function') {
    await submit.editReply({ content: 'Could not reach the saved-data storage channel. Check the bot configuration.' }).catch((): null => null);
    return;
  }

  const savePayload: any = { embeds: [buildRawEmbedJson(s.embed)] };
  if (s.embed.buttons.length > 0) {
    savePayload.components = [{
      type: 1,
      components: s.embed.buttons.slice(0, MAX_BUTTONS).map((button) => ({
        type: 2,
        style: 5,
        label: button.label.slice(0, 80) || 'Link',
        url: button.url,
        ...(button.emoji ? { emoji: { name: button.emoji } } : {}),
      })),
    }];
  }
  const rawJson = JSON.stringify(savePayload, null, 2);

  const safeFileName = name
    .replace(/[^a-z0-9_\-. ]/gi, '_')
    .replace(/\s+/g, '_')
    .slice(0, 80);
  const attachment = new AttachmentBuilder(Buffer.from(rawJson, 'utf-8'), {
    name: `${safeFileName}.json`,
  });

  const unixSec = Math.floor(Date.now() / 1000);
  const metaText =
    `**Server:** ${message.guild.name} (\`${guildId}\`)\n` +
    `**User:** ${message.author.tag ?? message.author.username} (<@${message.author.id}> \`${message.author.id}\`)\n` +
    `**Name:** \`${name}\`\n` +
    `**Type:** Embed\n` +
    `**Time:** <t:${unixSec}:F> (<t:${unixSec}:R>)`;

  const storageMsg: any = await withTimeout<any>(storageChannel.send({
    content: metaText,
    files: [attachment],
    allowedMentions: { parse: [] },
  }), 15_000, 'Storage message').catch((): null => null);

  if (!storageMsg) {
    await submit.editReply({ content: 'Failed to post the payload to the storage channel.' }).catch((): null => null);
    return;
  }

  void withTimeout(storageChannel.send({
    content: config.dataDivider,
    allowedMentions: { parse: [] },
  }), 15_000, 'Storage divider').catch((): null => null);

  let saveResult: true | 'duplicate' | false;
  try {
    saveResult = await withTimeout(client.db!.createSavedData({
      name,
      guildId,
      messageId: storageMsg.id,
      type: 'embed',
      createdBy: s.authorId,
    }), 15_000, 'Database write');
  } catch {
    await submit.editReply({
      content: `The payload was posted (message ID \`${storageMsg.id}\`) but the database write failed.`,
    }).catch((): null => null);
    return;
  }

  if (saveResult === 'duplicate') {
    await submit.editReply({ content: `A name conflict was detected while saving (message ID \`${storageMsg.id}\` was posted, but not recorded). Pick a different name and try again.` }).catch((): null => null);
    return;
  }

  if (saveResult === false) {
    await submit.editReply({ content: `The payload was posted (message ID \`${storageMsg.id}\`) but the database write failed.` }).catch((): null => null);
    return;
  }

  await submit.editReply({ content: `${emojis.blacktick} Saved as \`${name}\`. Use \`${client.config.prefix}send-data\` or \`${client.config.prefix}view-data\` to send it later.` }).catch((): null => null);
  } catch (error: any) {
    console.error(`[embed builder] Save as Data failed: ${error?.message ?? error}`);
    await submit.editReply({
      content: `The embed could not be saved: ${error?.message ?? 'unknown error'}`,
    }).catch((): null => null);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Saved-embed JSON → EmbedState reverse parser
// ─────────────────────────────────────────────────────────────────────────────

function embedJsonToState(json: any): EmbedState {
  const e = freshEmbed();

  // The saved format from doSaveAsData is { embeds: [...], components: [...] }
  const embedData: any =
    (Array.isArray(json.embeds) && json.embeds.length > 0) ? json.embeds[0] :
    (json.title !== undefined || json.description !== undefined)  ? json :
    null;

  if (embedData) {
    e.title       = (embedData.title       && embedData.title       !== '\u200b') ? embedData.title       : null;
    e.description = (embedData.description && embedData.description !== '\u200b') ? embedData.description : null;
    e.url         = embedData.url   ?? null;
    e.color       = embedData.color ?? null;

    if (embedData.author) {
      e.authorName = embedData.author.name     ?? null;
      e.authorIcon = embedData.author.icon_url ?? null;
      e.authorUrl  = embedData.author.url      ?? null;
    }
    if (embedData.footer) {
      e.footerText = embedData.footer.text     ?? null;
      e.footerIcon = embedData.footer.icon_url ?? null;
    }
    e.image     = embedData.image?.url     ?? null;
    e.thumbnail = embedData.thumbnail?.url ?? null;

    if (Array.isArray(embedData.fields)) {
      e.fields = embedData.fields
        .map((f: any) => ({
          name:   f.name  === '\u200b' ? '' : (f.name  ?? ''),
          value:  f.value === '\u200b' ? '' : (f.value ?? ''),
          inline: !!f.inline,
        }))
        .filter((f: any) => f.name || f.value);
    }
  }

  // Reconstruct link buttons from ActionRow components
  if (Array.isArray(json.components)) {
    for (const row of json.components) {
      if (row.type === 1 && Array.isArray(row.components)) {
        for (const btn of row.components) {
          if (btn.style === 5 && btn.label && btn.url) { // Link button
            let emoji: string | null = null;
            if (btn.emoji) emoji = btn.emoji.name ?? (btn.emoji.id ? `<:_:${btn.emoji.id}>` : null);
            e.buttons.push({ label: btn.label, url: btn.url, emoji });
          }
        }
      }
    }
  }

  return e;
}

// ─────────────────────────────────────────────────────────────────────────────
// Session entry point
// ─────────────────────────────────────────────────────────────────────────────

export async function startEmbedBuilderSession(
  message:  any,
  client:   CassieClient,
  authorId: string,
  initialMode: BuilderMode = 'idle',
): Promise<void> {
  // Pre-fetch saved embeds for this guild so the Load Data button state is
  // correct on first render without a round-trip after opening.
  const allItems: any[] = client.db
    ? await client.db.listSavedData(message.guild.id).catch((): any[] => [])
    : [];
  const embedItems = allItems.filter((item: any) => item.type === 'embed');
  if (initialMode === 'loaddata' && embedItems.length === 0) {
    await sendError({ message }, 'No saved embeds were found in this server. Save an embed first, then use `embed edit`.');
    return;
  }
  const birthday = client.db
    ? await client.db.getBirthday(authorId).catch((): null => null)
    : null;

  const s: BuilderSession = {
    authorId,
    placeholderContext: {
      user: message.author,
      member: message.member ?? message.guild.members?.cache?.get(authorId) ?? null,
      channel: message.channel,
      guild: message.guild,
      client,
      birthdayDay: birthday?.day ?? null,
      birthdayMonth: birthday?.month ?? null,
      birthdayYear: birthday?.year ?? null,
    },
    embed:      freshEmbed(),
    mode:       initialMode,
    activeIdx:  null,
    client,
    savedItems: embedItems,
    dataPage:   0,
  };

  const msg = await message.channel.send(payload(s)).catch((err: any): null => {
    console.error(`[embed builder] Failed to send initial panel: ${err?.message ?? err}`);
    return null;
  });
  if (!msg) {
    await sendError(
      { message },
      'Failed to open the embed builder. Check the console for details.',
    ).catch((): null => null);
    return;
  }

  const token = msg.id;

  const collector = msg.createMessageComponentCollector({
    filter: (ix: any) => authorOnlyFilter(ix, authorId),
    time: SESSION_MS,
  });

  collector.on('collect', async (ix: any) => {
    try {
      const cid = ix.customId as string;

      // ── Back ──────────────────────────────────────────────────────────────
      if (cid === 'eb:back') {
        s.mode = 'idle';
        s.activeIdx = null;
        await ix.update(payload(s));
        return;
      }

      // ── Open Fields panel ────────────────────────────────────────────────
      if (cid === 'eb:fields') {
        s.mode = 'fields';
        await ix.update(payload(s));
        return;
      }

      // ── Open Buttons panel ────────────────────────────────────────────────
      if (cid === 'eb:buttons') {
        s.mode = 'buttons';
        await ix.update(payload(s));
        return;
      }

      // ── Open Send panel ──────────────────────────────────────────────────
      if (cid === 'eb:send') {
        s.mode = 'send';
        await ix.update(payload(s));
        return;
      }

      // ── Clear all ────────────────────────────────────────────────────────
      if (cid === 'eb:clear') {
        s.embed = freshEmbed();
        s.mode = 'idle';
        s.activeIdx = null;
        await ix.update(payload(s));
        return;
      }

      // ── Basic Info modal ─────────────────────────────────────────────────
      if (cid === 'eb:basic') {
        const modal = modalBasic(token, s.embed);
        await ix.showModal(modal).catch((): null => null);
        const submit = await awaitModal(client, `eb:modal:${token}:basic`, authorId, 120_000);
        if (!submit) return;

        const title = tv(submit.fields, 'title');
        const description = tv(submit.fields, 'description');
        const colorRaw = tv(submit.fields, 'color');
        const url = tv(submit.fields, 'url');

        if (colorRaw && parseHexColor(colorRaw) === null) {
          await submit.reply({ content: 'Invalid hex color. Use a format like `#5865F2`.', flags: MessageFlags.Ephemeral }).catch((): null => null);
          return;
        }
        if (url && !isValidUrl(url)) {
          await submit.reply({ content: 'Invalid title URL — it must start with `http://` or `https://`.', flags: MessageFlags.Ephemeral }).catch((): null => null);
          return;
        }

        s.embed.title = title || null;
        s.embed.description = description || null;
        s.embed.color = colorRaw ? parseHexColor(colorRaw) : null;
        s.embed.url = url || null;

        await submit.update(payload(s)).catch((): null => null);
        return;
      }

      // ── Author modal ─────────────────────────────────────────────────────
      if (cid === 'eb:author') {
        const modal = modalAuthor(token, s.embed);
        await ix.showModal(modal).catch((): null => null);
        const submit = await awaitModal(client, `eb:modal:${token}:author`, authorId, 120_000);
        if (!submit) return;

        const authorIconRaw = tv(submit.fields, 'icon');
        const authorUrlRaw = tv(submit.fields, 'url');
        const resolvedAuthorIcon = resolvePlaceholders(authorIconRaw, s.placeholderContext);
        const resolvedAuthorUrl = resolvePlaceholders(authorUrlRaw, s.placeholderContext);
        if (authorIconRaw && !isValidUrl(resolvedAuthorIcon)) {
          await submit.reply({ content: 'Invalid author icon URL — it must start with `http://` or `https://`.', flags: MessageFlags.Ephemeral }).catch((): null => null);
          return;
        }
        if (authorUrlRaw && !isValidUrl(resolvedAuthorUrl)) {
          await submit.reply({ content: 'Invalid author URL — it must start with `http://` or `https://`.', flags: MessageFlags.Ephemeral }).catch((): null => null);
          return;
        }

        s.embed.authorName = tv(submit.fields, 'name') || null;
        s.embed.authorIcon = authorIconRaw || null;
        s.embed.authorUrl = authorUrlRaw || null;

        await submit.update(payload(s)).catch((): null => null);
        return;
      }

      // ── Footer modal ─────────────────────────────────────────────────────
      if (cid === 'eb:footer') {
        const modal = modalFooter(token, s.embed);
        await ix.showModal(modal).catch((): null => null);
        const submit = await awaitModal(client, `eb:modal:${token}:footer`, authorId, 120_000);
        if (!submit) return;

        const footerIconRaw = tv(submit.fields, 'icon');
        if (footerIconRaw && !isValidUrl(resolvePlaceholders(footerIconRaw, s.placeholderContext))) {
          await submit.reply({ content: 'Invalid footer icon URL — it must start with `http://` or `https://`.', flags: MessageFlags.Ephemeral }).catch((): null => null);
          return;
        }

        s.embed.footerText = tv(submit.fields, 'text') || null;
        s.embed.footerIcon = footerIconRaw || null;

        await submit.update(payload(s)).catch((): null => null);
        return;
      }

      // ── Images modal ─────────────────────────────────────────────────────
      if (cid === 'eb:images') {
        const modal = modalImages(token, s.embed);
        await ix.showModal(modal).catch((): null => null);
        const submit = await awaitModal(client, `eb:modal:${token}:images`, authorId, 120_000);
        if (!submit) return;

        const imageRaw = tv(submit.fields, 'image');
        const thumbRaw = tv(submit.fields, 'thumbnail');
        if (imageRaw && !isValidUrl(resolvePlaceholders(imageRaw, s.placeholderContext))) {
          await submit.reply({ content: 'Invalid image URL — it must start with `http://` or `https://`.', flags: MessageFlags.Ephemeral }).catch((): null => null);
          return;
        }
        if (thumbRaw && !isValidUrl(resolvePlaceholders(thumbRaw, s.placeholderContext))) {
          await submit.reply({ content: 'Invalid thumbnail URL — it must start with `http://` or `https://`.', flags: MessageFlags.Ephemeral }).catch((): null => null);
          return;
        }

        s.embed.image = imageRaw || null;
        s.embed.thumbnail = thumbRaw || null;

        await submit.update(payload(s)).catch((): null => null);
        return;
      }

      // ── Add field ─────────────────────────────────────────────────────────
      if (cid === 'eb:field_add') {
        if (s.embed.fields.length >= MAX_FIELDS) { await ix.update(payload(s)); return; }
        const modal = modalField(token);
        await ix.showModal(modal).catch((): null => null);
        const submit = await awaitModal(client, `eb:modal:${token}:field`, authorId, 120_000);
        if (!submit) return;

        const name = tv(submit.fields, 'name');
        const value = tv(submit.fields, 'value');
        const inline = tv(submit.fields, 'inline').toLowerCase() === 'yes';

        if (!name || !value) {
          await submit.reply({ content: 'Field name and value cannot be empty.', flags: MessageFlags.Ephemeral }).catch((): null => null);
          return;
        }

        s.embed.fields.push({ name, value, inline });
        s.mode = 'fields';
        await submit.update(payload(s)).catch((): null => null);
        return;
      }

      // ── Edit field select ─────────────────────────────────────────────────
      if (cid === 'eb:field_edit_sel') {
        const idx = parseInt(ix.values[0], 10);
        const existing = s.embed.fields[idx];
        if (!existing) { await ix.update(payload(s)); return; }

        const modal = modalField(token, existing);
        await ix.showModal(modal).catch((): null => null);
        const submit = await awaitModal(client, `eb:modal:${token}:field`, authorId, 120_000);
        if (!submit) return;

        const name = tv(submit.fields, 'name');
        const value = tv(submit.fields, 'value');
        const inline = tv(submit.fields, 'inline').toLowerCase() === 'yes';

        if (!name || !value) {
          await submit.reply({ content: 'Field name and value cannot be empty.', flags: MessageFlags.Ephemeral }).catch((): null => null);
          return;
        }

        s.embed.fields[idx] = { name, value, inline };
        s.mode = 'fields';
        await submit.update(payload(s)).catch((): null => null);
        return;
      }

      // ── Remove field select ──────────────────────────────────────────────
      if (cid === 'eb:field_remove_sel') {
        const idx = parseInt(ix.values[0], 10);
        s.embed.fields.splice(idx, 1);
        s.mode = 'fields';
        await ix.update(payload(s)).catch((): null => null);
        return;
      }

      // ── Add link button ──────────────────────────────────────────────────
      if (cid === 'eb:button_add') {
        if (s.embed.buttons.length >= MAX_BUTTONS) { await ix.update(payload(s)); return; }
        const modal = modalButton(token);
        await ix.showModal(modal).catch((): null => null);
        const submit = await awaitModal(client, `eb:modal:${token}:button`, authorId, 120_000);
        if (!submit) return;

        const label = tv(submit.fields, 'label');
        const url = tv(submit.fields, 'url');
        const emoji = tv(submit.fields, 'emoji');

        if (!label || !url) {
          await submit.reply({ content: 'Button label and URL cannot be empty.', flags: MessageFlags.Ephemeral }).catch((): null => null);
          return;
        }
        if (!isValidUrl(resolvePlaceholders(url, s.placeholderContext))) {
          await submit.reply({ content: 'Invalid button URL — it must start with `http://` or `https://`.', flags: MessageFlags.Ephemeral }).catch((): null => null);
          return;
        }

        s.embed.buttons.push({ label, url, emoji: emoji || null });
        s.mode = 'buttons';
        await submit.update(payload(s)).catch((): null => null);
        return;
      }

      // ── Edit link button select ──────────────────────────────────────────
      if (cid === 'eb:button_edit_sel') {
        const idx = parseInt(ix.values[0], 10);
        const existing = s.embed.buttons[idx];
        if (!existing) { await ix.update(payload(s)); return; }

        const modal = modalButton(token, existing);
        await ix.showModal(modal).catch((): null => null);
        const submit = await awaitModal(client, `eb:modal:${token}:button`, authorId, 120_000);
        if (!submit) return;

        const label = tv(submit.fields, 'label');
        const url = tv(submit.fields, 'url');
        const emoji = tv(submit.fields, 'emoji');

        if (!label || !url) {
          await submit.reply({ content: 'Button label and URL cannot be empty.', flags: MessageFlags.Ephemeral }).catch((): null => null);
          return;
        }
        if (!isValidUrl(resolvePlaceholders(url, s.placeholderContext))) {
          await submit.reply({ content: 'Invalid button URL — it must start with `http://` or `https://`.', flags: MessageFlags.Ephemeral }).catch((): null => null);
          return;
        }

        s.embed.buttons[idx] = { label, url, emoji: emoji || null };
        s.mode = 'buttons';
        await submit.update(payload(s)).catch((): null => null);
        return;
      }

      // ── Remove link button select ─────────────────────────────────────────
      if (cid === 'eb:button_remove_sel') {
        const idx = parseInt(ix.values[0], 10);
        s.embed.buttons.splice(idx, 1);
        s.mode = 'buttons';
        await ix.update(payload(s)).catch((): null => null);
        return;
      }

      // ── Load Data ────────────────────────────────────────────────────────
      if (cid === 'eb:loaddata') {
        // Refresh the list (might have changed since session start)
        await ix.deferUpdate().catch((): null => null);
        const all: any[] = client.db
          ? await client.db.listSavedData(message.guild.id).catch((): any[] => [])
          : [];
        s.savedItems = all.filter((item: any) => item.type === 'embed');
        s.dataPage   = 0;
        s.mode       = 'loaddata';
        await msg.edit(payload(s)).catch((): null => null);
        return;
      }

      if (cid === 'eb:loaddata_sel') {
        const value = (ix.values?.[0] ?? '') as string;

        // Pagination sentinels
        if (value === '__next__') { s.dataPage++; await ix.update(payload(s)); return; }
        if (value === '__prev__') { s.dataPage = Math.max(0, s.dataPage - 1); await ix.update(payload(s)); return; }

        // Real item — async fetch, so defer first
        await ix.deferUpdate().catch((): null => null);

        if (!client.db) {
          await msg.edit(payload(s)).catch((): null => null);
          return;
        }

        const entry = await client.db.getSavedData(message.guild.id, value).catch((): null => null);
        if (!entry) { s.mode = 'idle'; await msg.edit(payload(s)).catch((): null => null); return; }

        const storageChannelId: string = (client.config as any).savedDataChannelId ?? '';
        const storageChannel: any = storageChannelId
          ? (client.channels.cache.get(storageChannelId) ??
             await client.channels.fetch(storageChannelId).catch((): null => null))
          : null;

        if (!storageChannel) { s.mode = 'idle'; await msg.edit(payload(s)).catch((): null => null); return; }

        const storageMsg: any = await storageChannel.messages.fetch(entry.message_id).catch((): null => null);
        const attachment = storageMsg?.attachments?.first?.();

        if (!attachment) { s.mode = 'idle'; await msg.edit(payload(s)).catch((): null => null); return; }

        let raw: string;
        try {
          const res = await fetch(attachment.url);
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          raw = (await res.text()).trim();
        } catch {
          s.mode = 'idle';
          await msg.edit(payload(s)).catch((): null => null);
          return;
        }

        try {
          const json = JSON.parse(raw);
          s.embed    = embedJsonToState(json);
        } catch {
          // Malformed JSON — silently stay in idle with blank state
        }

        s.mode = 'idle';
        await msg.edit(payload(s)).catch((): null => null);
        return;
      }

      // ── Save as Data ─────────────────────────────────────────────────────
      if (cid === 'eb:savedata') {
        if (isFullyEmpty(s.embed)) { await ix.update(payload(s)); return; }

        if (!ix.memberPermissions?.has?.('Administrator')) {
          await ix.reply({ content: 'You need the **Administrator** permission to save this as data.', flags: MessageFlags.Ephemeral }).catch((): null => null);
          return;
        }

        if (!client.db) {
          await ix.reply({ content: 'Database is unavailable right now.', flags: MessageFlags.Ephemeral }).catch((): null => null);
          return;
        }

        await doSaveAsData(s, ix, message, client, token);
        return;
      }

      // ── Post Here ────────────────────────────────────────────────────────
      if (cid === 'eb:here') {
        const ok = await emit(s, message.channel);
        if (!ok) {
          await ix.reply({ content: "I don't have permission to post here, or there is nothing to send.", flags: MessageFlags.Ephemeral }).catch((): null => null);
          return;
        }
        s.mode = 'done';
        await ix.update(payload(s, false, message.channel.toString())).catch((): null => null);
        return;
      }

      // ── Channel select → post ────────────────────────────────────────────
      if (cid === 'eb:channel_sel') {
        const target = ix.channels?.first?.();
        if (!target) {
          await ix.reply({ content: 'Could not resolve that channel.', flags: MessageFlags.Ephemeral }).catch((): null => null);
          return;
        }

        // Verify the invoking member (not just the bot) can actually post in
        // the target channel — otherwise this becomes a relay to channels
        // they shouldn't be able to reach.
        const memberPerms = target.permissionsFor?.(ix.member);
        if (!memberPerms?.has?.('ViewChannel') || !memberPerms?.has?.('SendMessages')) {
          await ix.reply({ content: `You don't have permission to send messages in ${target.toString()}.`, flags: MessageFlags.Ephemeral }).catch((): null => null);
          return;
        }

        const ok = await emit(s, target);
        if (!ok) {
          await ix.reply({ content: `I don't have permission to post in ${target.toString()}, or there is nothing to send.`, flags: MessageFlags.Ephemeral }).catch((): null => null);
          return;
        }
        s.mode = 'done';
        await ix.update(payload(s, false, target.toString())).catch((): null => null);
        return;
      }
    } catch {
      await ix.deferUpdate().catch((): null => null);
    }
  });

  collector.on('end', async () => {
    await msg.edit(payload(s, true)).catch((): null => null);
  });
}
