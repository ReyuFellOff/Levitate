// xoxo/components/birthday/birthday.ts
//
// CV2 builders for the $birthday command family:
//   • buildBirthdaySettingsContainer — home view (server config + invoker's own birthday)
//   • buildBirthdayListContainer     — `birthday list` view (upcoming birthdays in this server)

import {
  ContainerBuilder,
  SeparatorBuilder,
  TextDisplayBuilder,
} from 'discord.js';
import type { LevitateClient } from '../../structures/LevitateClient.js';
import { formatBirthday } from '../../helpers/parseBirthdayDate.js';

const LIST_DISPLAY_LIMIT = 40;

// ─────────────────────────────────────────────────────────────────────────────
// Settings / home view
// ─────────────────────────────────────────────────────────────────────────────

export async function buildBirthdaySettingsContainer(
  guild:      any,
  client:     LevitateClient,
  prefix:     string,
  invokerId:  string,
): Promise<ContainerBuilder> {
  const settings = await client.db.getBirthdaySettings(guild.id).catch((): null => null);
  const own      = await client.db.getBirthday(invokerId).catch((): null => null);

  const channelLine = settings?.channel_id ? `**Channel:** <#${settings.channel_id}>` : `**Channel:** Not set`;
  let messageLine = '**Message:** Default';
  if (settings?.message_text || settings?.message_data) {
    const parts: string[] = [];
    if (settings.message_text) parts.push(`\`${settings.message_text.slice(0, 80)}${settings.message_text.length > 80 ? '…' : ''}\``);
    if (settings.message_data) parts.push(`saved data: \`${settings.message_data}\``);
    messageLine = `**Message:** ${parts.join(' + ')}`;
  }

  const ownLine = own
    ? `**Your birthday:** ${formatBirthday(own.day, own.month, own.year)}`
    : `**Your birthday:** Not set`;

  const statusLine = settings?.channel_id
    ? `Birthday announcements are **active** in this server.`
    : `Birthday announcements are **inactive** — no channel set.`;

  return new ContainerBuilder()
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(`## Birthday Settings`))
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent([channelLine, messageLine, ownLine].join('\n')))
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        [
          statusLine, '',
          `-# \`${prefix}birthday set <date>\` — set your birthday`,
          `-# \`${prefix}birthday unset\` — remove your birthday`,
          `-# \`${prefix}birthday list\` — see everyone's birthday in this server`,
          `-# \`${prefix}birthday channel set <#channel>\` — set announcement channel`,
          `-# \`${prefix}birthday channel remove\` — remove announcement channel`,
          `-# \`${prefix}birthday message set <text>\` — set the announcement message`,
          `-# \`${prefix}birthday message remove\` — reset to the default message`,
        ].join('\n'),
      ),
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// List view
// ─────────────────────────────────────────────────────────────────────────────

export interface BirthdayListEntry {
  user_id: string;
  day:     number;
  month:   number;
  year:    number | null;
}

// UTC-based to match the scheduler's UTC month/day lookup — keeps "Today!" in
// this list consistent with when the scheduler will actually announce it.
function daysUntilNext(month: number, day: number, now: Date): number {
  const todayUtcMidnight = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  let target = Date.UTC(now.getUTCFullYear(), month - 1, day);
  if (target < todayUtcMidnight) target = Date.UTC(now.getUTCFullYear() + 1, month - 1, day);
  return Math.round((target - todayUtcMidnight) / 86_400_000);
}

export function buildBirthdayListContainer(
  guild:     any,
  entries:   BirthdayListEntry[],
): ContainerBuilder {
  const now = new Date();

  const sorted = [...entries].sort(
    (a, b) => daysUntilNext(a.month, a.day, now) - daysUntilNext(b.month, b.day, now),
  );

  const container = new ContainerBuilder()
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(`## Birthdays in ${guild.name}`))
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true));

  if (!sorted.length) {
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent('No one in this server has set their birthday yet.'),
    );
    return container;
  }

  const shown   = sorted.slice(0, LIST_DISPLAY_LIMIT);
  const lines   = shown.map((e) => {
    const daysAway = daysUntilNext(e.month, e.day, now);
    const when     = daysAway === 0 ? '**Today!**' : `in ${daysAway} day${daysAway === 1 ? '' : 's'}`;
    return `<@${e.user_id}> — ${formatBirthday(e.day, e.month)} (${when})`;
  });

  container.addTextDisplayComponents(new TextDisplayBuilder().setContent(lines.join('\n')));

  if (sorted.length > shown.length) {
    container.addSeparatorComponents(new SeparatorBuilder().setDivider(true));
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`-# …and ${sorted.length - shown.length} more.`),
    );
  }

  return container;
}
