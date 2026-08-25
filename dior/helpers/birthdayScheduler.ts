// xoxo/helpers/birthdayScheduler.ts
//
// Daily birthday announcement scheduler. Loaded automatically by the helper
// loader (default export factory) and runs on every cluster process.
//
// At 00:00 UTC each day it looks up which users have a birthday matching
// that date, then — for every guild this process has cached — checks whether
// the birthday channel is configured and the member is present, and sends the
// configured birthday message if so.
//
// Duplicate-send protection: `birthday_announcements` records one document per
// (guild, user, year) so a restart or overlapping check never re-announces the
// same birthday twice in the same year.

import type { CassieClient } from '../structures/CassieClient.js';
import { sendBirthdayMessage } from '../components/birthday/birthdaySender.js';

const DAY_MS = 24 * 60 * 60 * 1000;

function millisecondsUntilNextUtcMidnight(now: Date): number {
  const nextMidnight = new Date(now);
  nextMidnight.setUTCHours(24, 0, 0, 0);
  return nextMidnight.getTime() - now.getTime();
}

export interface BirthdaySchedulerHandle {
  runCheck: () => Promise<void>;
}

export default function birthdayScheduler(client: CassieClient): BirthdaySchedulerHandle {
  async function runCheck(): Promise<void> {
    if (!client.db) return;

    const now   = new Date();
    const month = now.getUTCMonth() + 1;
    const day   = now.getUTCDate();
    const year  = now.getUTCFullYear();

    const birthdays = await client.db.getBirthdaysByMonthDay(month, day).catch((): any[] => []);
    if (!birthdays.length) return;

    const userIds = birthdays.map((b: any) => b.user_id);

    for (const guild of client.guilds.cache.values()) {
      try {
        const settings = await client.db.getBirthdaySettings(guild.id).catch((): null => null);
        if (!settings?.channel_id) continue;

        for (const userId of userIds) {
          const member =
            guild.members.cache.get(userId) ??
            await guild.members.fetch(userId).catch((): null => null);
          if (!member) continue;

          // Atomic claim — the unique index is the concurrency guard, so this
          // is safe against overlapping ticks / restarts / multi-process races.
          const claimed = await client.db.claimBirthdayAnnouncement(guild.id, userId, year).catch((): boolean => false);
          if (!claimed) continue; // already announced this year, or DB hiccup — skip

          const result = await sendBirthdayMessage(member, client).catch((): null => null);
          if (!result?.sent) {
            // Delivery actually failed (e.g. missing permissions) — release the
            // claim so the next tick retries instead of silently giving up for the year.
            await client.db.releaseBirthdayAnnouncement(guild.id, userId, year).catch((): null => null);
          }
        }
      } catch {
        continue;
      }
    }
  }

  setTimeout(() => {
    runCheck().catch((): null => null);
    setInterval(() => { runCheck().catch((): null => null); }, DAY_MS);
  }, millisecondsUntilNextUtcMidnight(new Date()));

  return { runCheck };
}
