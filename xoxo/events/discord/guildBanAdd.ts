// xoxo/events/discord/guildBanAdd.ts
//
// Logging: fires when a member is banned.

import { AuditLogEvent } from 'discord.js';
import type { LevitateClient } from '../../structures/LevitateClient.js';
import { dispatchLog, fetchAuditLogExecutor } from '../../helpers/logDispatcher.js';
import { buildMemberBanPayload } from '../../components/logging/logMessages.js';
import { checkAntinukeModule } from '../../helpers/antinukeEngine.js';

export const name = 'guildBanAdd';
export const once = false;

export async function execute(ban: any, client: LevitateClient): Promise<void> {
  const guild = ban.guild;
  const user = ban.user;

  const executor = await fetchAuditLogExecutor(guild, AuditLogEvent.MemberBanAdd, user.id);
  const reason = ban.reason ?? '';
  const payload = buildMemberBanPayload(user, reason, executor);
  await dispatchLog(client, guild.id, 'member', [user.id], payload);

  await checkAntinukeModule({
    client,
    guild,
    module: 'banAdd',
    executor,
    actionDescription: `banned ${user.tag ?? user.id}`,
    revert: async () => { await guild.bans.remove(user.id, 'Antinuke: reverting unauthorized mass ban'); },
  });
}
