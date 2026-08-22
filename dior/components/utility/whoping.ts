import { config } from '../../config.js';
// xoxo/components/utility/whoping.ts
//
// CV2 payload builder for $whoping — minimal ping history panel.

import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  MessageFlags,
  SeparatorBuilder,
  TextDisplayBuilder,
} from 'discord.js';
import { emojis } from '../../emojis.js';

export interface PingEntry {
  authorId:   string;
  messageUrl: string;
  timestamp:  number;
}

export function buildWhopingPayload(
  targetUserId: string,
  pings:        PingEntry[],
  scanned:      number,
): any {
  const container = new ContainerBuilder().setAccentColor(parseInt(config.defaultAccentColor.replace('#', ''), 16));

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `## ${emojis.bloodRip} Who pinged <@${targetUserId}>?`,
    ),
  );
  container.addSeparatorComponents(new SeparatorBuilder().setDivider(true));

  if (pings.length === 0) {
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `No pings found in the last ${scanned} messages.`,
      ),
    );
  } else {
    const lines = pings.map((p, i) => {
      const ts = `<t:${Math.floor(p.timestamp / 1000)}:R>`;
      return `\`${i + 1}.\` <@${p.authorId}> · ${ts} · [Jump](${p.messageUrl})`;
    });

    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(lines.join('\n')),
    );
  }

  container.addSeparatorComponents(new SeparatorBuilder().setDivider(true));
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `-# Scanned last ${scanned} messages in this channel.`,
    ),
  );

  return {
    components:      [container],
    flags:           MessageFlags.IsComponentsV2,
    allowedMentions: { parse: [] },
  };
}

export function buildWhopingNonePayload(targetUserId: string, scanned: number): any {
  const container = new ContainerBuilder().setAccentColor(parseInt(config.defaultAccentColor.replace('#', ''), 16));

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `## ${emojis.bloodRip} Who pinged <@${targetUserId}>?`,
    ),
  );
  container.addSeparatorComponents(new SeparatorBuilder().setDivider(true));
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `No pings found in the last ${scanned} messages.`,
    ),
  );
  container.addSeparatorComponents(new SeparatorBuilder().setDivider(true));
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `-# Scanned last ${scanned} messages in this channel.`,
    ),
  );

  return {
    components:      [container],
    flags:           MessageFlags.IsComponentsV2,
    allowedMentions: { parse: [] },
  };
}
