// xoxo/events/discord/roleCreate.ts
//
// Logging: fires when a role is created.

import { AuditLogEvent } from 'discord.js';
import type { CassieClient } from '../../structures/CassieClient.js';
import { dispatchLog, fetchAuditLogExecutor } from '../../helpers/logDispatcher.js';
import { buildRoleCreatePayload } from '../../components/logging/logMessages.js';
import { checkAntinukeModule } from '../../helpers/antinukeEngine.js';

export const name = 'roleCreate';
export const once = false;

export async function execute(role: any, client: CassieClient): Promise<void> {
  const executor = await fetchAuditLogExecutor(role.guild, AuditLogEvent.RoleCreate, role.id);
  const payload = buildRoleCreatePayload(role, executor);
  await dispatchLog(client, role.guild.id, 'role', [role.id], payload);

  await checkAntinukeModule({
    client,
    guild: role.guild,
    module: 'roleCreate',
    executor,
    actionDescription: `created role @${role.name ?? role.id}`,
    revert: async () => { await role.delete('Antinuke: reverting unauthorized role create'); },
  });
}
