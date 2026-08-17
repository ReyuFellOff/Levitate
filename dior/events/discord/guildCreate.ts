// xoxo/events/discord/guildCreate.ts

import webhookLogger from '../../utils/webhookLogger.js';
import { ensureGuildInvite } from '../../helpers/inviteCache.js';
import { applyDefaultNameStyle } from '../../helpers/nameStyle.js';

export const name = 'guildCreate';
export const once = false;

export async function execute(guild: any, client?: any): Promise<void> {
  console.log(`[GUILD] Joined: ${guild.name} (${guild.id}) — Members: ${guild.memberCount}`);
  const inviteCode = client ? await ensureGuildInvite(client, guild).catch((): string => 'N/A') : 'N/A';
  webhookLogger.logGuildJoin(guild, inviteCode);

  if (client) {
    applyDefaultNameStyle(client, guild.id).catch((): null => null);

    // Persist updated counts so the website stats stay current.
    if (client.db) {
      const g = client.guilds.cache;
      client.db.updateBotStats({
        servers:  g.size,
        members:  g.reduce((a: number, b: any) => a + b.memberCount, 0),
        channels: g.reduce((a: number, b: any) => a + b.channels.cache.size, 0),
      }).catch((): null => null);
    }
  }
}
