// xoxo/components/utility/namestyle.ts
//
// Full interactive name-style wizard for $namestyle.
//
// Flow:
//   Home → Font + Effect (single page, two dropdowns) → Color 1 → [Color 2 if Gradient] → Applied
//
// All pages are edits on a single bot message. Custom IDs are scoped to the
// invoker's message ID so multiple concurrent sessions never collide.
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
import type { LevitateClient }  from '../../structures/LevitateClient.js';
import type { NameStyleDoc }    from '../../database/database.js';

// ── Constants ─────────────────────────────────────────────────────────────────

const HEADER = `## ${emojis.blackCross ?? '🎨'} Name Style`;
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

/** 15 preset colors, 3 rows of 5 */
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
  step:      'home' | 'fonteffect' | 'color1' | 'color2';
  fontId?:   number;
  effectId?: number;
  color1?:   number;
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
      await msg.edit(buildHomePage(scopeId, null, s.guildName, true));
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

function header(): ContainerBuilder {
  return new ContainerBuilder()
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(HEADER))
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true));
}

// ── Page builders ─────────────────────────────────────────────────────────────

export function buildHomePage(
  scopeId:   string,
  style:     NameStyleDoc | null,
  guildName: string,
  disabled = false,
): any {
  const info = style
    ? `${emojis.whiteArrow} **Font:** ${FONTS[style.font_id] ?? `ID ${style.font_id}`}\n` +
      `${emojis.whiteArrow} **Effect:** ${EFFECTS[style.effect_id] ?? `ID ${style.effect_id}`}\n` +
      `${emojis.whiteArrow} **Color(s):** ${style.colors.map(intToHex).join(', ')}`
    : `${emojis.whiteArrow} No custom style set — using Discord default.`;

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(nsId(scopeId, 'customize'))
      .setLabel('Customize')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(disabled),
    new ButtonBuilder()
      .setCustomId(nsId(scopeId, 'reset'))
      .setLabel('Reset to Default')
      .setStyle(ButtonStyle.Danger)
      .setDisabled(disabled || !style),
    new ButtonBuilder()
      .setCustomId(nsId(scopeId, 'cancel'))
      .setLabel('Cancel')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(disabled),
  );

  return wrap(
    header()
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(
        `**${guildName}** — current style:\n${info}`,
      ))
      .addActionRowComponents(row),
  );
}

/**
 * Combined font + effect page.
 * Shows two dropdowns (font, effect) and a Next button that is enabled only
 * when both a font and an effect have been selected.
 */
export function buildFontEffectPage(scopeId: string, session: NsSession, disabled = false): any {
  const fontMenu = new StringSelectMenuBuilder()
    .setCustomId(nsId(scopeId, 'font'))
    .setPlaceholder('Step 1 — Choose a font…')
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
    .setPlaceholder('Step 2 — Choose an effect…')
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

  const bothSelected = session.fontId !== undefined && session.effectId !== undefined;

  const bottomRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(nsId(scopeId, 'back', 'home'))
      .setLabel('← Back')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(disabled),
    new ButtonBuilder()
      .setCustomId(nsId(scopeId, 'nextcolor'))
      .setLabel('Next →')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(disabled || !bothSelected),
  );

  const fontName   = session.fontId   ? (FONTS[session.fontId]   ?? `Font ${session.fontId}`)   : '—';
  const effectName = session.effectId ? (EFFECTS[session.effectId] ?? `Effect ${session.effectId}`) : '—';
  // Gradient (effectId 2) requires a second color — surface that info upfront
  const gradientNote = session.effectId === 2
    ? `\n${emojis.whiteArrow} **Gradient** selected — you will pick two colors.`
    : '';

  return wrap(
    header()
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(
        `### Step 1 of 2 — Font & Effect\n` +
        `Choose the font and color effect for **${session.guildName}**.\n\n` +
        `${emojis.whiteArrow} **Font:** ${fontName}\n` +
        `${emojis.whiteArrow} **Effect:** ${effectName}${gradientNote}`,
      ))
      .addActionRowComponents(new ActionRowBuilder<any>().addComponents(fontMenu))
      .addActionRowComponents(new ActionRowBuilder<any>().addComponents(effectMenu))
      .addActionRowComponents(bottomRow),
  );
}

function buildColorRows(
  scopeId:   string,
  slot:      'color1' | 'color2',
  disabled = false,
): ActionRowBuilder<ButtonBuilder>[] {
  const rows: ActionRowBuilder<ButtonBuilder>[] = [];

  // 3 rows of 5 preset colors
  for (let r = 0; r < 3; r++) {
    const row = new ActionRowBuilder<ButtonBuilder>();
    for (let c = 0; c < 5; c++) {
      const preset = PRESET_COLORS[r * 5 + c];
      row.addComponents(
        new ButtonBuilder()
          .setCustomId(nsId(scopeId, slot, preset.hex))
          .setLabel(preset.label)
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(disabled),
      );
    }
    rows.push(row);
  }

  // 4th row: Custom hex + Back
  const backTarget = slot === 'color2' ? 'color1' : 'fonteffect';
  rows.push(
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(nsId(scopeId, slot, 'custom'))
        .setLabel('✏️  Custom hex')
        .setStyle(ButtonStyle.Primary)
        .setDisabled(disabled),
      new ButtonBuilder()
        .setCustomId(nsId(scopeId, 'back', backTarget))
        .setLabel('← Back')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(disabled),
    ),
  );

  return rows;
}

export function buildColor1Page(scopeId: string, session: NsSession, disabled = false): any {
  const fontName   = FONTS[session.fontId!]    ?? `Font ${session.fontId}`;
  const effectName = EFFECTS[session.effectId!] ?? `Effect ${session.effectId}`;

  const c = header().addTextDisplayComponents(new TextDisplayBuilder().setContent(
    `### Step 2 of 2 — Color\n` +
    `${emojis.whiteArrow} **Font:** ${fontName} · **Effect:** ${effectName}\n\n` +
    `Pick a preset or enter your own hex code.`,
  ));
  for (const row of buildColorRows(scopeId, 'color1', disabled)) c.addActionRowComponents(row);
  return wrap(c);
}

export function buildColor2Page(scopeId: string, session: NsSession, disabled = false): any {
  const fontName   = FONTS[session.fontId!]    ?? `Font ${session.fontId}`;
  const effectName = EFFECTS[session.effectId!] ?? `Effect ${session.effectId}`;
  const c1Hex      = session.color1 !== undefined ? intToHex(session.color1) : '—';

  const c = header().addTextDisplayComponents(new TextDisplayBuilder().setContent(
    `### Gradient — Second Color\n` +
    `${emojis.whiteArrow} **Font:** ${fontName} · **Effect:** ${effectName} · **Color 1:** ${c1Hex}\n\n` +
    `Pick the second gradient color.`,
  ));
  for (const row of buildColorRows(scopeId, 'color2', disabled)) c.addActionRowComponents(row);
  return wrap(c);
}

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
    header().addTextDisplayComponents(new TextDisplayBuilder().setContent(
      `${emojis.blacktick ?? ''} Name style applied in **${guildName}**.\n\n` +
      `${emojis.whiteArrow} **Font:** ${FONTS[fontId] ?? `ID ${fontId}`}\n` +
      `${emojis.whiteArrow} **Effect:** ${EFFECTS[effectId] ?? `ID ${effectId}`}\n` +
      `${emojis.whiteArrow} **Color(s):** ${colorList}${warning}`,
    )),
  );
}

export function buildResetPage(guildName: string): any {
  return wrap(
    header().addTextDisplayComponents(new TextDisplayBuilder().setContent(
      `${emojis.blacktick ?? ''} Name style cleared in **${guildName}** — reverted to Discord default.`,
    )),
  );
}

export function buildCancelPage(): any {
  return wrap(
    header().addTextDisplayComponents(new TextDisplayBuilder().setContent('Cancelled.')),
  );
}

// ── Modal helper ──────────────────────────────────────────────────────────────

function makeColorModal(scopeId: string, slot: 'color1' | 'color2'): ModalBuilder {
  const label = slot === 'color2' ? 'Second color (hex)' : 'Color (hex)';
  return new ModalBuilder()
    .setCustomId(`ns:modal:${slot}:${scopeId}`)
    .setTitle('Enter a hex color')
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('ns:input:color')
          .setLabel(label)
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('#RRGGBB or RRGGBB')
          .setMinLength(6)
          .setMaxLength(7)
          .setRequired(true),
      ),
    );
}

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
  //   ns:<scopeId>:back:<target>
  //   ns:<scopeId>:color1:<hex|custom>
  //   ns:<scopeId>:color2:<hex|custom>
  const parts    = (interaction.customId as string).split(':');
  const scopeId  = parts[1];
  const action   = parts[2];
  const param    = parts[3]; // may be undefined

  const session = sessions.get(scopeId);
  if (!session) {
    return interaction.reply({ content: 'This session has expired. Run the command again.', flags: MessageFlags.Ephemeral }).catch((): null => null);
  }

  // Only the original invoker can interact
  if (interaction.user?.id !== session.authorId) {
    return interaction.reply({ content: "This isn't your panel.", flags: MessageFlags.Ephemeral }).catch((): null => null);
  }

  resetTimeout(scopeId);

  // ── Cancel ────────────────────────────────────────────────────────────────
  if (action === 'cancel') {
    clearSession(scopeId);
    await interaction.update(buildCancelPage()).catch((): null => null);
    return;
  }

  // ── Reset ─────────────────────────────────────────────────────────────────
  if (action === 'reset') {
    await interaction.deferUpdate().catch((): null => null);
    const ok = await resetNameStyle(client, session.guildId);
    if (!ok) {
      await interaction.followUp({ content: 'Failed to reset the style. Make sure I have **Change Nickname** permission.', flags: MessageFlags.Ephemeral }).catch((): null => null);
      return;
    }
    await client.db?.removeNameStyle(session.guildId).catch((): null => null);
    clearSession(scopeId);
    await interaction.message.edit(buildResetPage(session.guildName)).catch((): null => null);
    return;
  }

  // ── Customize → go to font+effect step ───────────────────────────────────
  if (action === 'customize') {
    session.step = 'fonteffect';
    await interaction.update(buildFontEffectPage(scopeId, session)).catch((): null => null);
    return;
  }

  // ── Back navigation ───────────────────────────────────────────────────────
  if (action === 'back') {
    if (param === 'home') {
      session.step = 'home';
      const style = await client.db?.getNameStyle(session.guildId).catch((): null => null) ?? null;
      await interaction.update(buildHomePage(scopeId, style, session.guildName)).catch((): null => null);
    } else if (param === 'fonteffect') {
      session.step = 'fonteffect';
      await interaction.update(buildFontEffectPage(scopeId, session)).catch((): null => null);
    } else if (param === 'color1') {
      session.step = 'color1';
      await interaction.update(buildColor1Page(scopeId, session)).catch((): null => null);
    }
    return;
  }

  // ── Font selected (dropdown) ──────────────────────────────────────────────
  if (action === 'font' && interaction.isStringSelectMenu?.()) {
    session.fontId = parseInt(interaction.values[0], 10);
    // Stay on the same page — update to reflect selection and possibly enable Next
    await interaction.update(buildFontEffectPage(scopeId, session)).catch((): null => null);
    return;
  }

  // ── Effect selected (dropdown) ────────────────────────────────────────────
  if (action === 'effect' && interaction.isStringSelectMenu?.()) {
    session.effectId = parseInt(interaction.values[0], 10);
    // Stay on the same page — update to reflect selection and possibly enable Next
    await interaction.update(buildFontEffectPage(scopeId, session)).catch((): null => null);
    return;
  }

  // ── Next button → advance to color 1 ─────────────────────────────────────
  if (action === 'nextcolor') {
    if (session.fontId === undefined || session.effectId === undefined) {
      // Shouldn't happen (button is disabled), but guard anyway
      await interaction.reply({ content: 'Please select both a font and an effect first.', flags: MessageFlags.Ephemeral }).catch((): null => null);
      return;
    }
    session.step = 'color1';
    await interaction.update(buildColor1Page(scopeId, session)).catch((): null => null);
    return;
  }

  // ── Color 1 — preset ─────────────────────────────────────────────────────
  if (action === 'color1' && param && param !== 'custom') {
    const val = hexToInt(param);
    if (val === null) return;
    session.color1 = val;
    if (session.effectId === 2) {
      // Gradient needs a second color
      session.step = 'color2';
      await interaction.update(buildColor2Page(scopeId, session)).catch((): null => null);
    } else {
      await applyAndFinish(interaction, scopeId, session, [val]);
    }
    return;
  }

  // ── Color 1 — custom hex via modal ────────────────────────────────────────
  if (action === 'color1' && param === 'custom') {
    const modalId = `ns:modal:color1:${scopeId}`;
    await interaction.showModal(makeColorModal(scopeId, 'color1')).catch((): null => null);

    const submit = await awaitModal(client, modalId, session.authorId, 60_000);
    if (!submit) return;

    const raw = submit.fields.getTextInputValue('ns:input:color') as string;
    const val = hexToInt(raw);
    if (val === null) {
      await submit.reply({ content: `\`${raw}\` is not a valid hex color.`, flags: MessageFlags.Ephemeral }).catch((): null => null);
      return;
    }

    session.color1 = val;
    await submit.deferUpdate().catch((): null => null);

    if (session.effectId === 2) {
      session.step = 'color2';
      await submit.message.edit(buildColor2Page(scopeId, session)).catch((): null => null);
    } else {
      await finishApply(submit.message, scopeId, session, [val]);
    }
    return;
  }

  // ── Color 2 — preset ─────────────────────────────────────────────────────
  if (action === 'color2' && param && param !== 'custom') {
    const val = hexToInt(param);
    if (val === null) return;
    await applyAndFinish(interaction, scopeId, session, [session.color1!, val]);
    return;
  }

  // ── Color 2 — custom hex via modal ────────────────────────────────────────
  if (action === 'color2' && param === 'custom') {
    const modalId = `ns:modal:color2:${scopeId}`;
    await interaction.showModal(makeColorModal(scopeId, 'color2')).catch((): null => null);

    const submit = await awaitModal(client, modalId, session.authorId, 60_000);
    if (!submit) return;

    const raw = submit.fields.getTextInputValue('ns:input:color') as string;
    const val = hexToInt(raw);
    if (val === null) {
      await submit.reply({ content: `\`${raw}\` is not a valid hex color.`, flags: MessageFlags.Ephemeral }).catch((): null => null);
      return;
    }

    await submit.deferUpdate().catch((): null => null);
    await finishApply(submit.message, scopeId, session, [session.color1!, val]);
    return;
  }
}

// ── Apply helpers ─────────────────────────────────────────────────────────────

/** Used when a button interaction is still open (can call .update()). */
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
    await message.channel?.send({ content: 'Failed to apply the style. Make sure I have **Change Nickname** permission.', flags: MessageFlags.Ephemeral }).catch((): null => null);
    return;
  }

  const saved = await session.client.db
    ?.setNameStyle(guildId, fontId!, effectId!, colors, session.authorId)
    .then(() => true)
    .catch(() => false) ?? false;

  clearSession(scopeId);
  await message.edit(buildAppliedPage(fontId!, effectId!, colors, guildName, saved)).catch((): null => null);
}
