import { config } from '../../config.js';
// xoxo/components/utility/namestyle.ts
//
// Interactive name-style form for $namestyle and the Customise panel.
//
// Design: single-page form with font dropdown, effect dropdown,
// color preset dropdowns, and a "Custom hex" button that opens a modal.
// The form is pre-populated with any existing DB style.
//
// Session timeout: 5 minutes of inactivity → components disabled.

import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  MessageFlags,
  ModalBuilder,
  SeparatorBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  TextDisplayBuilder,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';
import { emojis } from '../../emojis.js';
import { FONTS, EFFECTS, intToHex, hexToInt, applyNameStyle, resetNameStyle } from '../../helpers/nameStyle.js';
import type { LevitateClient } from '../../structures/LevitateClient.js';

// ── Constants ─────────────────────────────────────────────────────────────────

const HEADER    = `## ${emojis.blackCross ?? '🎨'} Name Style`;
const TIMEOUT_MS = 5 * 60_000;

const FONT_DESCS: Record<number, string> = {
  1:  'Bold Comic — thick comic-book lettering',
  2:  'Elegant Serif — classic refined look',
  3:  'Playful Bubble — soft sakura style',
  4:  'Soft & Rounded — jellybean feel',
  5:  'Stylish Display — mixed-weight',
  6:  'Clean & Geometric — modern look',
  7:  'Dark Medieval — gothic lettering',
  8:  'Retro 8-bit — pixel blocky style',
  9:  'Expressive Decorative — display font',
  10: 'Gothic Vampyre — dark elegant style',
  11: 'Standard Discord — no font change',
  12: 'Modern Slab — balanced slab-serif',
};

const EFFECT_DESCS: Record<number, string> = {
  1: 'Flat single-color fill',
  2: 'Left→right color blend — needs 2 colors',
  3: 'Glowing outline around letters',
  4: 'Gradient fill with visible stroke',
  5: 'Colored drop shadow behind letters',
  6: 'Soft outer glow — 2nd color is accent',
};

/** 15 preset colors */
const PRESET_COLORS: { label: string; hex: string }[] = [
  { label: 'White',    hex: 'FFFFFF' },
  { label: 'Black',    hex: '000000' },
  { label: 'Blurple',  hex: '5865F2' },
  { label: 'Pink',     hex: 'FF69B4' },
  { label: 'Red',      hex: 'ED4245' },
  { label: 'Green',    hex: '57F287' },
  { label: 'Gold',     hex: 'FFD700' },
  { label: 'Cyan',     hex: '00FFFF' },
  { label: 'Purple',   hex: '9B59B6' },
  { label: 'Orange',   hex: 'FFA500' },
  { label: 'Sky Blue', hex: '87CEEB' },
  { label: 'Lime',     hex: '39FF14' },
  { label: 'Coral',    hex: 'FF6B6B' },
  { label: 'Lavender', hex: 'B57BEE' },
  { label: 'Yellow',   hex: 'FEE75C' },
];

// ── Session ───────────────────────────────────────────────────────────────────

export interface NsSession {
  guildId:   string;
  guildName: string;
  authorId:  string;
  channelId: string;
  botMsgId:  string;
  client:    LevitateClient;
  fontId?:   number;
  effectId?: number;
  color1?:   number;  // int color value (from preset OR custom hex)
  color2?:   number;  // int color value for gradient (from preset OR custom hex)
  /** If set, clicking ← Back calls this instead of showing the generic cancel page. */
  backFn?:   (interaction: any) => Promise<void>;
}

const sessions  = new Map<string, NsSession>();
const timeouts  = new Map<string, NodeJS.Timeout>();

export function registerNsSession(scopeId: string, session: NsSession): void {
  sessions.set(scopeId, session);
  resetTimeout(scopeId);
}

function resetTimeout(scopeId: string): void {
  clearTimeout(timeouts.get(scopeId));
  const s = sessions.get(scopeId);
  if (!s) return;

  timeouts.set(scopeId, setTimeout(async () => {
    sessions.delete(scopeId);
    timeouts.delete(scopeId);
    try {
      const ch  = await s.client.channels.fetch(s.channelId) as any;
      const msg = await ch.messages.fetch(s.botMsgId);
      await msg.edit(buildFormPage(scopeId, s, true));
    } catch { /* message gone */ }
  }, TIMEOUT_MS));
}

function clearSession(scopeId: string): void {
  clearTimeout(timeouts.get(scopeId));
  sessions.delete(scopeId);
  timeouts.delete(scopeId);
}

// ── Custom ID helpers ─────────────────────────────────────────────────────────

export const nsId = (scopeId: string, ...parts: string[]) =>
  `ns:${scopeId}:${parts.join(':')}`;

// ── CV2 wrapper ───────────────────────────────────────────────────────────────

function wrap(container: ContainerBuilder): any {
  return { components: [container], flags: MessageFlags.IsComponentsV2, allowedMentions: { parse: [] } };
}

function headerContainer(): ContainerBuilder {
  return new ContainerBuilder().setAccentColor(parseInt(config.defaultAccentColor.replace('#', ''), 16))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(HEADER))
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true));
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Check if a color integer matches one of the preset colors. */
function matchesPreset(colorInt: number): boolean {
  const hex = intToHex(colorInt).replace('#', '').toUpperCase();
  return PRESET_COLORS.some(p => p.hex.toUpperCase() === hex);
}

function presetIsDefault(preset: { hex: string }, colorInt: number | undefined): boolean {
  if (colorInt === undefined) return false;
  return preset.hex.toUpperCase() === intToHex(colorInt).replace('#', '').toUpperCase();
}

// ── Form page ─────────────────────────────────────────────────────────────────

/**
 * Single-page form with font/effect/color dropdowns and custom hex button.
 * Pre-populates from session (which is seeded from the DB style if any exists).
 */
export function buildFormPage(
  scopeId:  string,
  session:  NsSession,
  disabled = false,
): any {
  const isGradient = session.effectId === 2;

  // Status line
  const fontName   = session.fontId   ? (FONTS[session.fontId]   ?? `ID ${session.fontId}`)   : 'Not set';
  const effectName = session.effectId ? (EFFECTS[session.effectId] ?? `ID ${session.effectId}`) : 'Not set';

  let colorText = 'Not set';
  if (session.color1 !== undefined) {
    colorText = `\`${intToHex(session.color1)}\``;
    if (session.color2 !== undefined) {
      colorText += ` → \`${intToHex(session.color2)}\``;
    }
  }

  // Note when a color came from custom hex (not a preset)
  const color1IsCustom = session.color1 !== undefined && !matchesPreset(session.color1);
  const color2IsCustom = session.color2 !== undefined && !matchesPreset(session.color2);
  const customNote =
    (color1IsCustom || color2IsCustom)
      ? `\n-# Custom hex color applied`
      : '';

  // Apply button enabled only when all required fields are filled
  const color2Ready = !isGradient || session.color2 !== undefined;
  const canApply = session.fontId !== undefined
    && session.effectId !== undefined
    && session.color1 !== undefined
    && color2Ready;

  // ── Dropdowns ──────────────────────────────────────────────────────────────

  const fontMenu = new StringSelectMenuBuilder()
    .setCustomId(nsId(scopeId, 'font'))
    .setPlaceholder('Font…')
    .setDisabled(disabled)
    .addOptions(
      Object.entries(FONTS).map(([id, name]) =>
        new StringSelectMenuOptionBuilder()
          .setValue(id)
          .setLabel(name)
          .setDescription(FONT_DESCS[Number(id)] ?? '')
          .setDefault(session.fontId === Number(id)),
      ),
    );

  const effectMenu = new StringSelectMenuBuilder()
    .setCustomId(nsId(scopeId, 'effect'))
    .setPlaceholder('Effect…')
    .setDisabled(disabled)
    .addOptions(
      Object.entries(EFFECTS).map(([id, name]) =>
        new StringSelectMenuOptionBuilder()
          .setValue(id)
          .setLabel(name)
          .setDescription(EFFECT_DESCS[Number(id)] ?? '')
          .setDefault(session.effectId === Number(id)),
      ),
    );

  const color1Menu = new StringSelectMenuBuilder()
    .setCustomId(nsId(scopeId, 'color1'))
    .setPlaceholder('Color…')
    .setDisabled(disabled)
    .addOptions(
      PRESET_COLORS.map(preset =>
        new StringSelectMenuOptionBuilder()
          .setValue(preset.hex)
          .setLabel(preset.label)
          // Pre-select only if this preset matches the current color AND it's not a custom hex override
          .setDefault(!color1IsCustom && presetIsDefault(preset, session.color1)),
      ),
    );

  // ── Button row ─────────────────────────────────────────────────────────────

  const buttonRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(nsId(scopeId, 'apply'))
      .setLabel('Apply')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(disabled || !canApply),
    new ButtonBuilder()
      .setCustomId(nsId(scopeId, 'customhex'))
      .setLabel('Custom Hex')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(disabled),
    new ButtonBuilder()
      .setCustomId(nsId(scopeId, 'reset'))
      .setLabel('Reset to Default')
      .setStyle(ButtonStyle.Danger)
      .setDisabled(disabled),
    new ButtonBuilder()
      .setCustomId(nsId(scopeId, 'cancel'))
      .setLabel('Back')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(disabled),
  );

  // ── Assemble container ─────────────────────────────────────────────────────

  const c = headerContainer()
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(
      `**${session.guildName}**\n` +
      `${emojis.whiteArrow} **Font:** ${fontName}\n` +
      `${emojis.whiteArrow} **Effect:** ${effectName}\n` +
      `${emojis.whiteArrow} **Color:** ${colorText}${customNote}`,
    ))
    .addActionRowComponents(new ActionRowBuilder<any>().addComponents(fontMenu))
    .addActionRowComponents(new ActionRowBuilder<any>().addComponents(effectMenu))
    .addActionRowComponents(new ActionRowBuilder<any>().addComponents(color1Menu));

  // Color 2 row — only shown when gradient is selected (stays within 5-row limit)
  if (isGradient) {
    const color2Menu = new StringSelectMenuBuilder()
      .setCustomId(nsId(scopeId, 'color2'))
      .setPlaceholder('Second color (gradient)…')
      .setDisabled(disabled)
      .addOptions(
        PRESET_COLORS.map(preset =>
          new StringSelectMenuOptionBuilder()
            .setValue(preset.hex)
            .setLabel(preset.label)
            .setDefault(!color2IsCustom && presetIsDefault(preset, session.color2)),
        ),
      );
    c.addActionRowComponents(new ActionRowBuilder<any>().addComponents(color2Menu));
  }

  c.addActionRowComponents(buttonRow);

  return wrap(c);
}

// ── Final-state pages ─────────────────────────────────────────────────────────

export function buildAppliedPage(
  fontId:    number,
  effectId:  number,
  colors:    number[],
  guildName: string,
  saved:     boolean,
): any {
  const colorList = colors.map(intToHex).join(', ');
  const warning   = saved ? '' : '\n\nStyle applied but **not saved** — it will not survive a restart.';

  return wrap(
    headerContainer().addTextDisplayComponents(new TextDisplayBuilder().setContent(
      `${emojis.blacktick ?? ''} Name style applied in **${guildName}**.\n\n` +
      `${emojis.whiteArrow} **Font:** ${FONTS[fontId] ?? `ID ${fontId}`}\n` +
      `${emojis.whiteArrow} **Effect:** ${EFFECTS[effectId] ?? `ID ${effectId}`}\n` +
      `${emojis.whiteArrow} **Color(s):** ${colorList}${warning}`,
    )),
  );
}

export function buildResetPage(guildName: string): any {
  return wrap(
    headerContainer().addTextDisplayComponents(new TextDisplayBuilder().setContent(
      `${emojis.blacktick ?? ''} Name style cleared in **${guildName}** — reverted to Discord default.`,
    )),
  );
}

export function buildCancelPage(): any {
  return wrap(
    headerContainer().addTextDisplayComponents(new TextDisplayBuilder().setContent('Cancelled.')),
  );
}

// ── Custom hex modal ──────────────────────────────────────────────────────────

function makeCustomHexModal(
  scopeId: string,
  session: NsSession,
): ModalBuilder {
  const isGradient = session.effectId === 2;

  const col1Input = new TextInputBuilder()
    .setCustomId('ns:input:hex1')
    .setLabel('Color 1 (hex)')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('#RRGGBB or RRGGBB')
    .setMinLength(6)
    .setMaxLength(7)
    .setRequired(!isGradient);  // required unless gradient (where col2 alone could be entered)

  // Pre-fill with current color if set
  if (session.color1 !== undefined) {
    col1Input.setValue(intToHex(session.color1));
  }

  const components: ActionRowBuilder<TextInputBuilder>[] = [
    new ActionRowBuilder<TextInputBuilder>().addComponents(col1Input),
  ];

  if (isGradient) {
    const col2Input = new TextInputBuilder()
      .setCustomId('ns:input:hex2')
      .setLabel('Color 2 (hex) — gradient only')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('#RRGGBB or RRGGBB')
      .setMinLength(6)
      .setMaxLength(7)
      .setRequired(false);

    if (session.color2 !== undefined) {
      col2Input.setValue(intToHex(session.color2));
    }

    components.push(new ActionRowBuilder<TextInputBuilder>().addComponents(col2Input));
  }

  const modal = new ModalBuilder()
    .setCustomId(`ns:modal:customhex:${scopeId}`)
    .setTitle('Enter hex color(s)');

  for (const row of components) modal.addComponents(row);
  return modal;
}

// ── Modal awaiter ─────────────────────────────────────────────────────────────

function awaitModal(
  client:    LevitateClient,
  customId:  string,
  userId:    string,
  timeoutMs: number,
): Promise<any | null> {
  return new Promise(resolve => {
    const timer = setTimeout(() => {
      client.removeListener('interactionCreate', handler);
      resolve(null);
    }, timeoutMs);

    function handler(i: any): void {
      if (i.isModalSubmit?.() && i.customId === customId && i.user?.id === userId) {
        clearTimeout(timer);
        client.removeListener('interactionCreate', handler);
        resolve(i);
      }
    }
    client.on('interactionCreate', handler);
  });
}

// ── Main interaction handler ──────────────────────────────────────────────────

export async function handleNsInteraction(interaction: any, client: LevitateClient): Promise<void> {
  // customId shapes:
  //   ns:<scopeId>:<action>
  //   ns:<scopeId>:<action>:<param>
  const parts   = (interaction.customId as string).split(':');
  const scopeId = parts[1];
  const action  = parts[2];
  const param   = parts[3]; // may be undefined

  const session = sessions.get(scopeId);
  if (!session) {
    return interaction.reply({
      content: 'This session has expired. Run the command again.',
      flags: MessageFlags.Ephemeral,
    }).catch((): null => null);
  }

  if (interaction.user?.id !== session.authorId) {
    return interaction.reply({
      content: "This isn't your panel.",
      flags: MessageFlags.Ephemeral,
    }).catch((): null => null);
  }

  resetTimeout(scopeId);

  // ── Cancel / Back ─────────────────────────────────────────────────────────
  if (action === 'cancel') {
    clearSession(scopeId);
    if (session.backFn) {
      await session.backFn(interaction);
    } else {
      await interaction.update(buildCancelPage()).catch((): null => null);
    }
    return;
  }

  // ── Reset ─────────────────────────────────────────────────────────────────
  if (action === 'reset') {
    await interaction.deferUpdate().catch((): null => null);
    const ok = await resetNameStyle(client, session.guildId);
    if (!ok) {
      await interaction.followUp({
        content: 'Failed to reset the style. Make sure I have **Change Nickname** permission.',
        flags: MessageFlags.Ephemeral,
      }).catch((): null => null);
      return;
    }
    await client.db?.removeNameStyle(session.guildId).catch((): null => null);
    clearSession(scopeId);
    await interaction.message.edit(buildResetPage(session.guildName)).catch((): null => null);
    return;
  }

  // ── Font selected (dropdown) ──────────────────────────────────────────────
  if (action === 'font' && interaction.isStringSelectMenu?.()) {
    session.fontId = parseInt(interaction.values[0], 10);
    await interaction.update(buildFormPage(scopeId, session)).catch((): null => null);
    return;
  }

  // ── Effect selected (dropdown) ────────────────────────────────────────────
  if (action === 'effect' && interaction.isStringSelectMenu?.()) {
    const newEffect = parseInt(interaction.values[0], 10);
    // Clear color2 when switching away from gradient
    if (newEffect !== 2) session.color2 = undefined;
    session.effectId = newEffect;
    await interaction.update(buildFormPage(scopeId, session)).catch((): null => null);
    return;
  }

  // ── Color 1 selected (dropdown) ───────────────────────────────────────────
  if (action === 'color1' && interaction.isStringSelectMenu?.()) {
    const val = hexToInt(interaction.values[0]);
    if (val !== null) {
      session.color1 = val;
      await interaction.update(buildFormPage(scopeId, session)).catch((): null => null);
    }
    return;
  }

  // ── Color 2 selected (dropdown) ───────────────────────────────────────────
  if (action === 'color2' && interaction.isStringSelectMenu?.()) {
    const val = hexToInt(interaction.values[0]);
    if (val !== null) {
      session.color2 = val;
      await interaction.update(buildFormPage(scopeId, session)).catch((): null => null);
    }
    return;
  }

  // ── Custom hex button → open modal ───────────────────────────────────────
  if (action === 'customhex') {
    const modalId = `ns:modal:customhex:${scopeId}`;
    await interaction.showModal(makeCustomHexModal(scopeId, session)).catch((): null => null);

    const submit = await awaitModal(client, modalId, session.authorId, 60_000);
    if (!submit) return;

    const raw1 = submit.fields.getTextInputValue?.('ns:input:hex1')?.trim() || '';
    const raw2 = submit.fields.getTextInputValue?.('ns:input:hex2')?.trim() || '';

    const errors: string[] = [];

    if (raw1) {
      const val = hexToInt(raw1);
      if (val === null) {
        errors.push(`\`${raw1}\` is not a valid hex color.`);
      } else {
        session.color1 = val;
      }
    }

    if (raw2) {
      const val = hexToInt(raw2);
      if (val === null) {
        errors.push(`\`${raw2}\` is not a valid hex color.`);
      } else {
        session.color2 = val;
      }
    }

    await submit.deferUpdate().catch((): null => null);

    if (errors.length) {
      await submit.followUp({
        content: errors.join('\n'),
        flags: MessageFlags.Ephemeral,
      }).catch((): null => null);
    }

    await submit.message?.edit(buildFormPage(scopeId, session)).catch((): null => null);
    return;
  }

  // ── Apply ─────────────────────────────────────────────────────────────────
  if (action === 'apply') {
    const { fontId, effectId, color1 } = session;
    if (fontId === undefined || effectId === undefined || color1 === undefined) {
      await interaction.reply({
        content: 'Please select a font, effect, and color before applying.',
        flags: MessageFlags.Ephemeral,
      }).catch((): null => null);
      return;
    }
    if (effectId === 2 && session.color2 === undefined) {
      await interaction.reply({
        content: 'Gradient effect requires a second color. Select it from the dropdown or use Custom Hex.',
        flags: MessageFlags.Ephemeral,
      }).catch((): null => null);
      return;
    }

    const colors = effectId === 2 ? [color1, session.color2!] : [color1];
    await applyAndFinish(interaction, scopeId, session, colors);
    return;
  }
}

// ── Apply helpers ─────────────────────────────────────────────────────────────

async function applyAndFinish(
  interaction: any,
  scopeId:     string,
  session:     NsSession,
  colors:      number[],
): Promise<void> {
  await interaction.deferUpdate().catch((): null => null);
  await finishApply(interaction.message, scopeId, session, colors);
}

async function finishApply(
  message:  any,
  scopeId:  string,
  session:  NsSession,
  colors:   number[],
): Promise<void> {
  const { guildId, guildName, fontId, effectId } = session;

  const ok = await applyNameStyle(session.client, guildId, fontId!, effectId!, colors);
  if (!ok) {
    await message.channel?.send({
      content: 'Failed to apply the style. Make sure I have **Change Nickname** permission.',
      flags: MessageFlags.Ephemeral,
    }).catch((): null => null);
    return;
  }

  const saved = await session.client.db
    ?.setNameStyle(guildId, fontId!, effectId!, colors, session.authorId)
    .then(() => true)
    .catch(() => false) ?? false;

  clearSession(scopeId);
  await message.edit(buildAppliedPage(fontId!, effectId!, colors, guildName, saved)).catch((): null => null);
}
