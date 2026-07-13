// xoxo/helpers/birthdayScheduler.ts
//
// Daily birthday announcement scheduler. Loaded automatically by the helper
// loader (default export factory) and runs on every cluster process.
//
// Every CHECK_INTERVAL_MS it looks up which users have a birthday matching
// today (UTC month + day), then — for every guild this process has cached —
// checks whether the birthday channel is configured and the member is present,
// and sends the configured birthday message if so.
//
// Duplicate-send protection: `birthday_announcements` records one document per
// (guild, user, year) so a restart or overlapping check never re-announces the
// same birthday twice in the same year.

import type { LevitateClient } from '../structures/LevitateClient.js';
import { sendBirthdayMessage } from '../components/birthday/birthdaySender.js';

const CHECK_INTERVAL_MS = 15 * 60 * 1000; // 15 minutes
const INITIAL_DELAY_MS  = 30 * 1000;      // let member caches warm up first

export interface BirthdaySchedulerHandle {
  runCheck: () => Promise<void>;
}

export default function birthdayScheduler(client: LevitateClient): BirthdaySchedulerHandle {
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

  setTimeout(() => { runCheck().catch((): null => null); }, INITIAL_DELAY_MS);
  setInterval(() => { runCheck().catch((): null => null); }, CHECK_INTERVAL_MS);

  return { runCheck };
}
