// xoxo/events/discord/guildDelete.ts

import webhookLogger from '../../utils/webhookLogger.js';

export const name = 'guildDelete';
export const once = false;

export async function execute(guild: any, client?: any): Promise<void> {
  if (!guild.available) return;
  console.log(`[GUILD] Left: ${guild.name} (${guild.id})`);
  const inviteCode: string | undefined = await client?.db?.getGuildInvite(guild.id).catch((): undefined => undefined);
  webhookLogger.logGuildLeave(guild, inviteCode);
  await client?.db?.removeGuildInvite(guild.id).catch(() => {});

  // Persist updated counts so the website stats stay current.
  if (client?.db) {
    const g = client.guilds.cache;
    client.db.updateBotStats({
      servers:  g.size,
      members:  g.reduce((a: number, b: any) => a + b.memberCount, 0),
      channels: g.reduce((a: number, b: any) => a + b.channels.cache.size, 0),
    }).catch((): null => null);
  }
}
