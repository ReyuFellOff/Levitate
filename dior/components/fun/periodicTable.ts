import { config } from '../../config.js';
// xoxo/components/fun/periodicTable.ts
//
// Popcat periodic-table API client and Components V2 response builder.

import {
  ContainerBuilder,
  MessageFlags,
  SectionBuilder,
  SeparatorBuilder,
  ThumbnailBuilder,
  TextDisplayBuilder,
} from 'discord.js';
import { emojis } from '../../emojis.js';
import { escapeFormatting } from '../../utils/formatting.js';

const PERIODIC_TABLE_API = 'https://api.popcat.xyz/v2/periodic-table';

export interface PeriodicTableElement {
  name: string;
  symbol: string;
  atomic_number: number;
  atomic_mass: number;
  period: number;
  phase: string;
  discovered_by: string;
  image: string;
  summary: string;
}

interface PeriodicTableResponse {
  error?: boolean;
  message?: PeriodicTableElement | { error?: string };
}

export interface PeriodicTableLookup {
  element?: PeriodicTableElement;
  error?: string;
}

export async function fetchPeriodicTableElement(query: string): Promise<PeriodicTableLookup> {
  const url = `${PERIODIC_TABLE_API}?element=${encodeURIComponent(query)}`;
  let response: Response;

  try {
    response = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    return { error: 'The periodic table API could not be reached right now. Please try again later.' };
  }

  if (!response.ok) {
    return { error: 'The periodic table API returned an error. Please try again later.' };
  }

  let data: PeriodicTableResponse;
  try {
    data = await response.json() as PeriodicTableResponse;
  } catch {
    return { error: 'The periodic table API returned an invalid response. Please try again later.' };
  }

  if (data.error || !data.message || !('name' in data.message)) {
    const apiError = data.message && 'error' in data.message
      ? data.message.error
      : null;
    return { error: apiError || 'That is not a valid element name, symbol, or atomic number.' };
  }

  return { element: data.message };
}

export function buildPeriodicTablePayload(element: PeriodicTableElement): any {
  const facts = [
    `**Atomic number:** \`${element.atomic_number}\``,
    `**Atomic mass:** \`${element.atomic_mass}\``,
    `**Period:** \`${element.period}\``,
    `**Phase:** \`${escapeFormatting(element.phase)}\``,
    `**Discovered by:** ${escapeFormatting(element.discovered_by)}`,
  ].join('\n');

  const container = new ContainerBuilder().setAccentColor(parseInt(config.defaultAccentColor.replace('#', ''), 16))
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `## ${emojis.blackCards} Periodic Table — ${escapeFormatting(element.name)} (${escapeFormatting(element.symbol)})`,
      ),
    )
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
    .addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(facts),
          new TextDisplayBuilder().setContent(
            `> ${escapeFormatting(element.summary).slice(0, 3_800)}`,
          ),
        )
        .setThumbnailAccessory(
          new ThumbnailBuilder()
            .setURL(element.image)
            .setDescription(`${element.name} (${element.symbol})`),
        ),
    )
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true));

  return {
    components: [container],
    flags: MessageFlags.IsComponentsV2,
    allowedMentions: { parse: [] },
  };
}