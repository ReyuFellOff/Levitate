// xoxo/events/discord/guildBanRemove.ts
//
// Logging: fires when a member is unbanned.

import { AuditLogEvent } from 'discord.js';
import type { LevitateClient } from '../../structures/LevitateClient.js';
import { dispatchLog, fetchAuditLogExecutor } from '../../helpers/logDispatcher.js';
import { buildMemberUnbanPayload } from '../../components/logging/logMessages.js';

export const name = 'guildBanRemove';
export const once = false;

export async function execute(ban: any, client: LevitateClient): Promise<void> {
  const guild = ban.guild;
  const user = ban.user;

  const executor = await fetchAuditLogExecutor(guild, AuditLogEvent.MemberBanRemove, user.id);
  const payload = buildMemberUnbanPayload(user, executor);
  await dispatchLog(client, guild.id, 'member', [user.id], payload);
}
