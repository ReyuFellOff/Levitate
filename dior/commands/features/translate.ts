import { config } from '../../config.js';
// xoxo/commands/features/translate.ts
//
// $translate <text>          — auto-detect source → English
// $tr        <text>          — alias
// $translate-es <text>       — → Spanish
// $tr-es     <text>          — alias
// $translate-hi <text>       — → Hindi
// $tr-hi     <text>          — alias
// $translate-fr <text>       — → French
// $tr-fr     <text>          — alias
// $translate-de <text>       — → German
// $tr-de     <text>          — alias
// $translate-ja <text>       — → Japanese
// $tr-ja     <text>          — alias
// $translate-es-mx / $tr-mx  — → Mexican Spanish
//
// Slash: /translate <text> [language]

import { MessageFlags } from 'discord.js';
import type { LevitateClient } from '../../structures/LevitateClient.js';
import { sendError } from '../../components/statusMessages.js';
import { buildTranslateContainer, LANG_INFO } from '../../components/features/translate.js';

export const options = {
  name:        'translate',
  aliases:     [
    'tr',
    'translate-en', 'tr-en',
    'translate-es', 'tr-es',
    'translate-hi', 'tr-hi',
    'translate-fr', 'tr-fr',
    'translate-de', 'tr-de',
    'translate-ja', 'tr-ja',
    'translate-es-mx', 'translate-mx', 'tr-mx',
  ] as string[],
  description: 'Translate text from any language into English (default) or a target language.',
  usage: `translate <text>
translate-es <text>
translate-hi <text>
translate-fr <text>
translate-de <text>
translate-ja <text>
translate-es-mx <text>`,
  category:    'features',
  owner:       false,
  cooldown:    5,
};

// ── Language definitions ───────────────────────────────────────────────────────

// Maps the invoked command alias → target language code
const INVOCATION_LANG: Record<string, string> = {
  'translate':      'en',
  'tr':             'en',
  'translate-en':   'en',
  'tr-en':          'en',
  'translate-es':   'es',
  'tr-es':          'es',
  'translate-hi':   'hi',
  'tr-hi':          'hi',
  'translate-fr':   'fr',
  'tr-fr':          'fr',
  'translate-de':   'de',
  'tr-de':          'de',
  'translate-ja':   'ja',
  'tr-ja':          'ja',
  'translate-es-mx':'es-mx',
  'translate-mx':   'es-mx',
  'tr-mx':          'es-mx',
};

// Max characters of input text accepted (after stripping markdown).
// Formatting is stripped before translation so the translator receives clean
// plain text, and the same stripped text is shown in the CV2 panel.
const MAX_TEXT = 500;

// ── Markdown stripper ──────────────────────────────────────────────────────────
// Removes Discord formatting so the translator and display both see clean text.

function stripMarkdown(text: string): string {
  return text
    // Headings: ### / ## / #
    .replace(/^#{1,3}\s+/gm, '')
    // Discord subtext: -# …
    .replace(/^-#\s+/gm, '')
    // Blockquote lines: > …
    .replace(/^>\s?/gm, '')
    // Bold + italic: ***text***
    .replace(/\*{3}([\s\S]+?)\*{3}/g, '$1')
    // Bold: **text**
    .replace(/\*{2}([\s\S]+?)\*{2}/g, '$1')
    // Italic: *text*
    .replace(/\*([\s\S]+?)\*/g, '$1')
    // Underline: __text__
    .replace(/_{2}([\s\S]+?)_{2}/g, '$1')
    // Italic: _text_
    .replace(/_([\s\S]+?)_/g, '$1')
    // Strikethrough: ~~text~~
    .replace(/~{2}([\s\S]+?)~{2}/g, '$1')
    // Spoiler: ||text||
    .replace(/\|{2}([\s\S]+?)\|{2}/g, '$1')
    // Code block: ```lang\ntext\n```
    .replace(/```(?:\w+\n)?([\s\S]+?)```/g, '$1')
    // Inline code: `text`
    .replace(/`([\s\S]+?)`/g, '$1')
    // Markdown links: [text](url)
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .trim();
}

// ── Translation helper ──────────────────────────────────────────────────────────

async function translateText(
  text: string,
  targetLang: string,
): Promise<{ translated: string; sourceLang: string }> {
  // es-mx uses 'es' with Google's API
  const apiLang = targetLang === 'es-mx' ? 'es' : targetLang;
  const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${encodeURIComponent(apiLang)}&dt=t&q=${encodeURIComponent(text)}`;

  const res = await fetch(url, { signal: AbortSignal.timeout(12_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  const data = await res.json() as any;
  // data[0] = array of [translated_chunk, source_chunk, ...]
  // data[2] = detected source language code
  const translated = (data[0] as any[])
    .map((chunk: any) => (Array.isArray(chunk) ? chunk[0] : ''))
    .join('');
  const sourceLang = (typeof data[2] === 'string' ? data[2] : 'auto').toLowerCase();
  return { translated: translated.trim(), sourceLang };
}

// ── Detect which language-variant alias was used ───────────────────────────────

async function detectTargetLang(message: any, client: LevitateClient): Promise<string> {
  // Resolve the effective guild prefix (may be overridden via DB)
  let guildPrefix = client.config.prefix;
  if (client.db && message.guild?.id) {
    const override = await client.db.getGuildPrefix(message.guild.id).catch((): null => null);
    if (override) guildPrefix = override;
  }
  const selfPrefix = (client as any).userPrefixes?.get?.(message.author.id) as string | undefined;

  const content = message.content.trim();
  const selfLen  = (selfPrefix && content.startsWith(selfPrefix)) ? selfPrefix.length : 0;
  const guildLen = content.startsWith(guildPrefix) ? guildPrefix.length : 0;
  const matchLen = Math.max(selfLen, guildLen);

  let sliced = content;
  if (matchLen > 0) {
    const chosen = (selfLen >= guildLen && selfLen > 0) ? selfPrefix! : guildPrefix;
    sliced = content.slice(chosen.length).trim();
  }

  const invokedAlias = sliced.split(/\s+/)[0]?.toLowerCase() ?? 'translate';
  return INVOCATION_LANG[invokedAlias] ?? 'en';
}

// ── Prefix execute ─────────────────────────────────────────────────────────────

export async function prefixExecute(
  message: any,
  args:    string[],
  client:  LevitateClient,
): Promise<any> {
  const ctx = { message };

  const raw  = args.join(' ').trim();
  const text = stripMarkdown(raw);

  const targetLang = await detectTargetLang(message, client);

  if (!text) {
    const tgt    = LANG_INFO[targetLang] ?? { name: targetLang.toUpperCase(), flag: '🌐' };
    const prefix = client.config.prefix;
    const variant = targetLang === 'en' ? 'translate' : `translate-${targetLang}`;
    return sendError(
      ctx,
      `Provide the text you want to translate.\n-# **Usage:** \`${prefix}${variant} <text>\` — translates to ${tgt.flag} ${tgt.name}`,
    );
  }

  if (text.length > MAX_TEXT)
    return sendError(ctx, `Text is too long (**${text.length}** characters). Maximum is **${MAX_TEXT}**.`);

  let result: { translated: string; sourceLang: string };
  try {
    result = await translateText(text, targetLang);
  } catch (err: unknown) {
    const detail = err instanceof Error ? err.message : String(err);
    console.error(`[translate] API error: ${detail}`);
    return sendError(ctx, 'Translation failed — the service may be temporarily unavailable. Please try again in a moment.');
  }

  if (!result.translated)
    return sendError(ctx, 'No translation was returned. Please try again.');

  const container = buildTranslateContainer(text, result.translated, result.sourceLang, targetLang);

  return message.channel.send({
    components: [container],
    flags: MessageFlags.IsComponentsV2,
    allowedMentions: { parse: [] },
  });
}

// ── Slash execute ──────────────────────────────────────────────────────────────

export async function slashExecute(
  interaction: any,
  _client:     LevitateClient,
): Promise<any> {
  const ctx = { interaction };

  const raw:  string = interaction.options.getString('text', true).trim();
  const text: string = stripMarkdown(raw);
  const lang: string = interaction.options.getString('language') ?? 'en';

  if (!text)
    return interaction.reply({ content: 'Please provide some text to translate.', ephemeral: true });

  if (text.length > MAX_TEXT) {
    const { sendError: se } = await import('../../components/statusMessages.js');
    return se(ctx, `Text is too long (**${text.length}** characters). Maximum is **${MAX_TEXT}**.`);
  }

  await interaction.deferReply();

  let result: { translated: string; sourceLang: string };
  try {
    result = await translateText(text, lang);
  } catch (err: unknown) {
    const detail = err instanceof Error ? err.message : String(err);
    console.error(`[translate] API error: ${detail}`);
    const { sendError: se } = await import('../../components/statusMessages.js');
    return se(ctx, 'Translation failed — the service may be temporarily unavailable. Please try again in a moment.');
  }

  if (!result.translated) {
    const { sendError: se } = await import('../../components/statusMessages.js');
    return se(ctx, 'No translation was returned. Please try again.');
  }

  const container = buildTranslateContainer(text, result.translated, result.sourceLang, lang);

  return interaction.editReply({
    components: [container],
    flags: MessageFlags.IsComponentsV2,
    allowedMentions: { parse: [] },
  });
}
