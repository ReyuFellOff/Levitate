// xoxo/events/discord/guildMemberAdd.ts
//
// Fires when a new member joins a guild.
// Dispatches the configured greet message (if any) via the shared greetSender.

import { AuditLogEvent } from 'discord.js';
import type { LevitateClient } from '../../structures/LevitateClient.js';
import { sendGreetMessage } from '../../components/welcomer/greetSender.js';
import { dispatchLog, fetchAuditLogExecutor } from '../../helpers/logDispatcher.js';
import { buildMemberJoinPayload } from '../../components/logging/logMessages.js';
import { checkAntinukeModule } from '../../helpers/antinukeEngine.js';

export const name = 'guildMemberAdd';
export const once = false;

/** Assigns the configured autorole set to a newly-joined member (humans and bots use separate lists). */
async function applyAutorole(member: any, client: LevitateClient): Promise<void> {
  if (!client.db) return;
  const cfg = await client.db.getAutoroleConfig(member.guild.id).catch((): null => null);
  if (!cfg || cfg.enabled === false) return;

  const ids = member.user?.bot ? cfg.bot_role_ids : cfg.member_role_ids;
  if (!ids || ids.length === 0) return;

  const guild  = member.guild;
  const botTop = guild.members.me?.roles?.highest?.position ?? 0;

  // Re-validate at assignment time in case roles/hierarchy changed since the panel was configured.
  const toAssign = ids
    .map((id: string) => guild.roles.cache.get(id))
    .filter((role: any) => role && !role.managed && role.id !== guild.id && role.position < botTop)
    .map((role: any) => role.id);

  if (toAssign.length === 0) return;

  await member.roles.add(toAssign, 'Autorole on join').catch((err: unknown) => {
    console.error(`[autorole] Failed to assign roles to ${member.id} in ${guild.id}: ${err instanceof Error ? err.message : err}`);
  });
}

export async function execute(member: any, client: LevitateClient): Promise<void> {
  if (!member.guild) return;
  await applyAutorole(member, client);
  await sendGreetMessage(member, client, false);
  await dispatchLog(client, member.guild.id, 'member', [member.id], buildMemberJoinPayload(member));

  if (member.user?.bot) {
    const inviter = await fetchAuditLogExecutor(member.guild, AuditLogEvent.BotAdd, member.id);
    await checkAntinukeModule({
      client,
      guild: member.guild,
      module: 'botAdd',
      executor: inviter,
      actionDescription: `added bot ${member.user.tag ?? member.id}`,
      revert: async () => { await member.kick('Antinuke: removing unauthorized bot'); },
    });
  }
}
