import { ContainerBuilder, MessageFlags, SectionBuilder, SeparatorBuilder, TextDisplayBuilder, ThumbnailBuilder } from 'discord.js';
import { config } from '../../config.js';
import type { DominantColor } from '../../helpers/dominantColor.js';

export interface ColorDetails {
  hex?: string;
  name?: string;
  rgb?: string;
  hsl_string?: string;
  brightened?: string;
}

function fallbackColor(): DominantColor {
  const hex = config.defaultAccentColor.replace('#', '').padStart(6, '0').slice(0, 6).toUpperCase();
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  const max = Math.max(r, g, b) / 255;
  const min = Math.min(r, g, b) / 255;
  const lightness = (max + min) / 2;
  return {
    hex: `#${hex}`,
    rgb: { r, g, b },
    hsl: { h: 0, s: 0, l: Math.round(lightness * 100) },
  };
}

export function buildDominantPayload(
  label: string,
  color: DominantColor | null,
  imageUrl: string | null,
  details: ColorDetails | null = null,
): any {
  const resolved = color ?? fallbackColor();
  const body = [
    `**Name:** ${details?.name ?? 'Unknown'}`,
    `**Hex:** \`${details?.hex ?? resolved.hex}\``,
    `**RGB:** \`${details?.rgb ?? `rgb(${resolved.rgb.r}, ${resolved.rgb.g}, ${resolved.rgb.b})`}\``,
    `**HSL:** \`${details?.hsl_string ?? `hsl(${resolved.hsl.h}, ${resolved.hsl.s}%, ${resolved.hsl.l}%)`}\``,
    details?.brightened ? `**Brightened:** \`${details.brightened}\`` : null,
    color ? null : '-# No usable image was available, so the bot default color is shown.',
  ].filter(Boolean).join('\n');

  const section = new SectionBuilder()
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(`${label}\n\n${body}`));
  if (imageUrl) section.setThumbnailAccessory(new ThumbnailBuilder().setURL(imageUrl));

  const container = new ContainerBuilder()
    .setAccentColor(parseInt(resolved.hex.slice(1), 16))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent('## Dominant Color'))
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
    .addSectionComponents(section);

  return {
    components: [container],
    flags: MessageFlags.IsComponentsV2,
    allowedMentions: { parse: [] },
  };
}
