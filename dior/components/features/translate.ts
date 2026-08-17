// xoxo/components/features/translate.ts
//
// CV2 payload builder for the $translate / /translate commands.

import {
  ContainerBuilder,
  SeparatorBuilder,
  TextDisplayBuilder,
} from 'discord.js';

// ── Language definitions (shared with command file) ────────────────────────────

export interface LangInfo { name: string; flag: string; }

export const LANG_INFO: Record<string, LangInfo> = {
  'en':    { name: 'English',         flag: '🇬🇧' },
  'es':    { name: 'Spanish',         flag: '🇪🇸' },
  'es-mx': { name: 'Mexican Spanish', flag: '🇲🇽' },
  'hi':    { name: 'Hindi',           flag: '🇮🇳' },
  'fr':    { name: 'French',          flag: '🇫🇷' },
  'de':    { name: 'German',          flag: '🇩🇪' },
  'ja':    { name: 'Japanese',        flag: '🇯🇵' },
  // common auto-detected source languages
  'zh':    { name: 'Chinese',         flag: '🇨🇳' },
  'zh-cn': { name: 'Chinese',         flag: '🇨🇳' },
  'zh-tw': { name: 'Chinese (TW)',    flag: '🇹🇼' },
  'ar':    { name: 'Arabic',          flag: '🇸🇦' },
  'ru':    { name: 'Russian',         flag: '🇷🇺' },
  'pt':    { name: 'Portuguese',      flag: '🇧🇷' },
  'pt-br': { name: 'Portuguese',      flag: '🇧🇷' },
  'ko':    { name: 'Korean',          flag: '🇰🇷' },
  'it':    { name: 'Italian',         flag: '🇮🇹' },
  'tr':    { name: 'Turkish',         flag: '🇹🇷' },
  'nl':    { name: 'Dutch',           flag: '🇳🇱' },
  'pl':    { name: 'Polish',          flag: '🇵🇱' },
  'sv':    { name: 'Swedish',         flag: '🇸🇪' },
  'da':    { name: 'Danish',          flag: '🇩🇰' },
  'no':    { name: 'Norwegian',       flag: '🇳🇴' },
  'fi':    { name: 'Finnish',         flag: '🇫🇮' },
  'uk':    { name: 'Ukrainian',       flag: '🇺🇦' },
  'vi':    { name: 'Vietnamese',      flag: '🇻🇳' },
  'th':    { name: 'Thai',            flag: '🇹🇭' },
  'id':    { name: 'Indonesian',      flag: '🇮🇩' },
  'ms':    { name: 'Malay',           flag: '🇲🇾' },
  'bn':    { name: 'Bengali',         flag: '🇧🇩' },
  'ur':    { name: 'Urdu',            flag: '🇵🇰' },
  'fa':    { name: 'Persian',         flag: '🇮🇷' },
  'el':    { name: 'Greek',           flag: '🇬🇷' },
  'he':    { name: 'Hebrew',          flag: '🇮🇱' },
  'cs':    { name: 'Czech',           flag: '🇨🇿' },
  'sk':    { name: 'Slovak',          flag: '🇸🇰' },
  'ro':    { name: 'Romanian',        flag: '🇷🇴' },
  'hu':    { name: 'Hungarian',       flag: '🇭🇺' },
  'bg':    { name: 'Bulgarian',       flag: '🇧🇬' },
  'hr':    { name: 'Croatian',        flag: '🇭🇷' },
  'sr':    { name: 'Serbian',         flag: '🇷🇸' },
  'ca':    { name: 'Catalan',         flag: '🏴' },
  'lt':    { name: 'Lithuanian',      flag: '🇱🇹' },
  'lv':    { name: 'Latvian',         flag: '🇱🇻' },
  'et':    { name: 'Estonian',        flag: '🇪🇪' },
  'sl':    { name: 'Slovenian',       flag: '🇸🇮' },
};

// ── CV2 result container ───────────────────────────────────────────────────────

// Max characters to display per text block in the CV2 panel.
const DISP_LIMIT = 800;

/**
 * Builds the CV2 result container for a completed translation.
 *
 * Layout:
 *   {src flag} {src lang} 🠮 {tgt flag} {tgt lang}
 *   ─────────────────────────────────────────────
 *   Original
 *
 *   {original text}
 *
 *   {translated text}
 *   ─────────────────────────────────────────────
 *   -# Powered by Google Translate
 */
export function buildTranslateContainer(
  original:   string,
  translated: string,
  sourceLang: string,
  targetLang: string,
): ContainerBuilder {
  const src = LANG_INFO[sourceLang] ?? { name: sourceLang.toUpperCase(), flag: '🌐' };
  const tgt = LANG_INFO[targetLang] ?? { name: targetLang.toUpperCase(), flag: '🌐' };

  const sameLanguage =
    sourceLang !== 'auto' &&
    sourceLang.split('-')[0] === targetLang.split('-')[0];

  const origDisplay  = original.length  > DISP_LIMIT ? original.slice(0, DISP_LIMIT)  + '…' : original;
  const transDisplay = translated.length > DISP_LIMIT ? translated.slice(0, DISP_LIMIT) + '…' : translated;

  const bodyLines: string[] = [
    'Original',
    '',
    origDisplay,
    '',
    transDisplay,
  ];

  if (sameLanguage) {
    bodyLines.push('', '-# The text appears to already be in the target language.');
  }

  return new ContainerBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `${src.flag} ${src.name} 🠮 ${tgt.flag} ${tgt.name}`,
      ),
    )
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(bodyLines.join('\n')),
    )
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent('-# Powered by Google Translate'),
    );
}
