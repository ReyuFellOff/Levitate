// xoxo/helpers/nameStyle.ts
//
// Utility helpers for applying and resetting Discord name styles.
// Uses the client's built-in REST instance — no extra setup needed.

import type { LevitateClient } from '../structures/LevitateClient.js';
import type { NameStyleDoc }   from '../database/database.js';

// ── Lookup tables ─────────────────────────────────────────────────────────────

export const FONTS: Record<number, string> = {
  1:  'Bangers',
  2:  'BioRhyme',
  3:  'Cherry Bomb',
  4:  'Chicle',
  5:  'Compagnon',
  6:  'MuseoModerno',
  7:  'Neo-Castel',
  8:  'Pixelify Sans',
  9:  'Ribes',
  10: 'Sinistre',
  11: 'Default (GG Sans)',
  12: 'Zilla Slab',
};

/** Alternate aliases accepted on input. */
const FONT_ALIASES: Record<string, number> = {
  bangers: 1, biorhyme: 2, cherrybomb: 3, 'cherry bomb': 3, cherry: 3,
  chicle: 4, compagnon: 5, museomoderno: 6, museo: 6,
  neocastel: 7, 'neo-castel': 7, medieval: 7,
  pixelifysans: 8, pixelify: 8, pixel: 8,
  ribes: 9, sinistre: 10, vampyre: 10,
  default: 11, ggsans: 11, gg: 11,
  zillaslab: 12, zilla: 12, tempo: 12,
};

export const EFFECTS: Record<number, string> = {
  1: 'Solid',
  2: 'Gradient',
  3: 'Neon',
  4: 'Toon',
  5: 'Pop',
  6: 'Glow',
};

const EFFECT_ALIASES: Record<string, number> = {
  solid: 1, gradient: 2, neon: 3, toon: 4, pop: 5, glow: 6,
};

// ── Parsers ───────────────────────────────────────────────────────────────────

/** Accepts "1"–"12" or any alias. Returns the font ID or null if unrecognised. */
export function parseFont(raw: string): number | null {
  if (/^\d+$/.test(raw)) {
    const n = parseInt(raw, 10);
    return n >= 1 && n <= 12 ? n : null;
  }
  return FONT_ALIASES[raw.toLowerCase()] ?? null;
}

/** Accepts "1"–"6" or any alias. Returns the effect ID or null if unrecognised. */
export function parseEffect(raw: string): number | null {
  if (/^\d+$/.test(raw)) {
    const n = parseInt(raw, 10);
    return n >= 1 && n <= 6 ? n : null;
  }
  return EFFECT_ALIASES[raw.toLowerCase()] ?? null;
}

/** Converts "#RRGGBB" / "RRGGBB" to a 24-bit integer, or null if invalid. */
export function hexToInt(hex: string): number | null {
  const clean = hex.replace(/^#/, '').trim();
  if (!/^[0-9a-fA-F]{6}$/.test(clean)) return null;
  return parseInt(clean, 16);
}

/** Converts a 24-bit integer back to "#RRGGBB". */
export function intToHex(n: number): string {
  return '#' + n.toString(16).toUpperCase().padStart(6, '0');
}

// ── REST calls ────────────────────────────────────────────────────────────────

/**
 * Applies a name style to the bot's member record in the given guild.
 * Returns true on success, false if the API call failed.
 */
export async function applyNameStyle(
  client:   LevitateClient,
  guildId:  string,
  fontId:   number,
  effectId: number,
  colors:   number[],
): Promise<boolean> {
  try {
    await (client.rest as any).patch(`/guilds/${guildId}/members/@me`, {
      body: {
        display_name_font_id:   fontId,
        display_name_effect_id: effectId,
        display_name_colors:    colors,
      },
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Clears the bot's name style in the given guild, reverting to Discord's default.
 * Returns true on success.
 */
export async function resetNameStyle(
  client:  LevitateClient,
  guildId: string,
): Promise<boolean> {
  try {
    await (client.rest as any).patch(`/guilds/${guildId}/members/@me`, {
      body: {
        display_name_font_id:   null,
        display_name_effect_id: null,
        display_name_colors:    null,
      },
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Re-applies all stored name styles after a restart.
 * For guilds that have their own stored style, that style is applied.
 * For guilds with no stored style, the support server's style (if any) is used as a fallback.
 * Staggers requests by 1.5 s each to avoid rate-limit bursts on large bots.
 */
export async function reapplyAllNameStyles(client: LevitateClient): Promise<void> {
  if (!client.db) return;
  try {
    const styles = await client.db.getAllNameStyles();

    // Build a map of guildId → style for fast lookup
    const styleMap = new Map<string, NameStyleDoc>(styles.map(s => [s.guild_id, s]));

    // Resolve the support server default (if any)
    const supportServerId: string = client.config.supportServerId ?? '';
    const defaultStyle: NameStyleDoc | null = supportServerId
      ? (styleMap.get(supportServerId) ?? null)
      : null;

    for (const [guildId] of client.guilds.cache) {
      if (guildId === '__default__') continue;

      const ownStyle  = styleMap.get(guildId);
      const effective = ownStyle ?? defaultStyle;
      if (!effective) continue;

      await applyNameStyle(client, guildId, effective.font_id, effective.effect_id, effective.colors);
      await new Promise(r => setTimeout(r, 1500));
    }
  } catch {
    // Non-fatal — best-effort
  }
}

/**
 * Applies the support server's name style to a single guild (used on guildCreate).
 * Does nothing if there is no support server style configured or stored.
 * Returns true if a style was applied.
 */
export async function applyDefaultNameStyle(
  client:  LevitateClient,
  guildId: string,
): Promise<boolean> {
  if (!client.db) return false;
  try {
    const supportServerId: string = client.config.supportServerId ?? '';
    if (!supportServerId) return false;

    // Skip the support server itself — it manages its own style
    if (guildId === supportServerId) return false;

    const defaultStyle = await client.db.getNameStyle(supportServerId).catch((): null => null);
    if (!defaultStyle) return false;

    return applyNameStyle(
      client, guildId,
      defaultStyle.font_id, defaultStyle.effect_id, defaultStyle.colors,
    );
  } catch {
    return false;
  }
}
