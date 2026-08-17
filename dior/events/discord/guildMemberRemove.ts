// xoxo/events/discord/guildMemberRemove.ts
//
// Logging: fires when a member leaves the guild (by leaving OR being kicked).
// If a ban was just issued for this user (see guildBanAdd), that event covers
// the log instead, to avoid double-logging the same departure.

import { AuditLogEvent } from 'discord.js';
import type { LevitateClient } from '../../structures/LevitateClient.js';
import { dispatchLog, fetchAuditLogExecutor } from '../../helpers/logDispatcher.js';
import { buildMemberLeavePayload } from '../../components/logging/logMessages.js';
import { checkAntinukeModule } from '../../helpers/antinukeEngine.js';

export const name = 'guildMemberRemove';
export const once = false;

export async function execute(member: any, client: LevitateClient): Promise<void> {
  if (!member.guild) return;

  const banExecutor = await fetchAuditLogExecutor(member.guild, AuditLogEvent.MemberBanAdd, member.id, 4000);
  if (banExecutor) return; // guildBanAdd already logged this departure

  const payload = buildMemberLeavePayload(member);
  await dispatchLog(client, member.guild.id, 'member', [member.id], payload);

  const kickExecutor = await fetchAuditLogExecutor(member.guild, AuditLogEvent.MemberKick, member.id, 4000);
  if (kickExecutor) {
    await checkAntinukeModule({
      client,
      guild: member.guild,
      module: 'kick',
      executor: kickExecutor,
      actionDescription: `kicked ${member.user?.tag ?? member.id}`,
    });
  }
}
