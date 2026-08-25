// xoxo/messages/ping.ts
//
// Builds the Components V2 payload for the ping command response.
// Lavalink latency is omitted — it's not applicable to Cassie.

import {
  ContainerBuilder,
  SeparatorBuilder,
  TextDisplayBuilder,
} from 'discord.js';
import { config } from '../config.js';
import { emojis } from '../emojis.js';

export interface PingStats {
  apiLatency:     number;
  wsPing:         number | null;
  dbLatency:      number | null;
  guildPrefix:    string;
  authorUsername: string;
}

function fmt(ms: number | null): string {
  return ms === null ? 'N/A' : `${ms}ms`;
}

export function buildPingPayload(stats: PingStats): object {
  const { apiLatency, wsPing, dbLatency, guildPrefix, authorUsername } = stats;
  const accentColor = parseInt(config.defaultAccentColor.replace('#', ''), 16);

  const hasIssue =
    dbLatency === null ||
    wsPing === null ||
    (typeof apiLatency === 'number' && apiLatency > 500) ||
    (typeof wsPing     === 'number' && wsPing     > 500) ||
    (typeof dbLatency  === 'number' && dbLatency  > 500);

  const headerLine = hasIssue
    ? `## ${emojis.redBlackCross} The bot is NOT working properly.`
    : `## ${emojis.greentick} The bot is working properly.`;

  const statsBlock = [
    `- API Latency: ${fmt(apiLatency)}`,
    `- Websocket Ping: ${fmt(wsPing)}`,
    `- Database Latency: ${fmt(dbLatency)}`,
  ].join('\n');

  const footerLine = `-# Requested by ${authorUsername} | For more info use \`${guildPrefix}debug\` command.`;

  return new ContainerBuilder()
    .setAccentColor(accentColor)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(headerLine),
    )
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(statsBlock))
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(footerLine));
}
