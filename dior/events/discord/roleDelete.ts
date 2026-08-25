// xoxo/events/discord/roleDelete.ts
//
// Logging: fires when a role is deleted.

import { AuditLogEvent } from 'discord.js';
import type { CassieClient } from '../../structures/CassieClient.js';
import { dispatchLog, fetchAuditLogExecutor } from '../../helpers/logDispatcher.js';
import { buildRoleDeletePayload } from '../../components/logging/logMessages.js';
import { checkAntinukeModule } from '../../helpers/antinukeEngine.js';

export const name = 'roleDelete';
export const once = false;

export async function execute(role: any, client: CassieClient): Promise<void> {
  const executor = await fetchAuditLogExecutor(role.guild, AuditLogEvent.RoleDelete, role.id);
  const payload = buildRoleDeletePayload(role, executor);
  await dispatchLog(client, role.guild.id, 'role', [role.id], payload);

  const guild = role.guild;
  const snapshot = {
    name: role.name,
    color: role.color,
    hoist: role.hoist,
    mentionable: role.mentionable,
    permissions: role.permissions?.bitfield,
  };

  await checkAntinukeModule({
    client,
    guild,
    module: 'roleDelete',
    executor,
    actionDescription: `deleted role @${snapshot.name ?? role.id}`,
    revert: async () => {
      await guild.roles.create({
        name: snapshot.name,
        color: snapshot.color,
        hoist: snapshot.hoist,
        mentionable: snapshot.mentionable,
        permissions: snapshot.permissions,
        reason: 'Antinuke: reverting unauthorized role delete',
      });
    },
  });
}
