// xoxo/events/discord/roleUpdate.ts
//
// Logging: fires when a role's properties change.
//
// Position-only changes are debounced per guild (600 ms window) because
// Discord fires roleUpdate for *every* role whose position shifts whenever
// any single role is reordered — including as a side-effect of
// member.roles.set(). Without debouncing, assigning one role floods the log
// with dozens of "Position changed" entries. After the burst settles, a
// single "Roles Reordered" summary is logged instead.
//
// For all other property changes (name, colour, permissions, etc.) a 2-second
// pause is inserted before fetching the audit log so Discord has time to
// populate the entry — otherwise the executor shows as "Unknown".

import { AuditLogEvent } from 'discord.js';
import type { LevitateClient } from '../../structures/LevitateClient.js';
import { dispatchLog, fetchAuditLogExecutor } from '../../helpers/logDispatcher.js';
import { buildRoleUpdatePayload, buildRolesReorderedPayload } from '../../components/logging/logMessages.js';
import { checkAntinukeModule, grantedDangerousPermissions } from '../../helpers/antinukeEngine.js';

export const name = 'roleUpdate';
export const once = false;

// Per-guild debounce for position-only bursts
const positionChangePending = new Map<string, ReturnType<typeof setTimeout>>();

function diffFields(oldRole: any, newRole: any): { field: string; before: string; after: string }[] {
  const changes: { field: string; before: string; after: string }[] = [];

  if (oldRole.name !== newRole.name) {
    changes.push({ field: 'Name', before: oldRole.name, after: newRole.name });
  }
  if (oldRole.hexColor !== newRole.hexColor) {
    changes.push({ field: 'Color', before: oldRole.hexColor, after: newRole.hexColor });
  }
  if (oldRole.hoist !== newRole.hoist) {
    changes.push({ field: 'Hoisted', before: oldRole.hoist ? 'Yes' : 'No', after: newRole.hoist ? 'Yes' : 'No' });
  }
  if (oldRole.mentionable !== newRole.mentionable) {
    changes.push({
      field: 'Mentionable',
      before: oldRole.mentionable ? 'Yes' : 'No',
      after:  newRole.mentionable ? 'Yes' : 'No',
    });
  }
  if (oldRole.position !== newRole.position) {
    changes.push({ field: 'Position', before: `${oldRole.position}`, after: `${newRole.position}` });
  }
  if (oldRole.permissions?.bitfield?.toString() !== newRole.permissions?.bitfield?.toString()) {
    changes.push({ field: 'Permissions', before: '*changed*', after: '*see role settings*' });
  }

  return changes;
}

export async function execute(oldRole: any, newRole: any, client: LevitateClient): Promise<void> {
  const changes = diffFields(oldRole, newRole);
  if (!changes.length) return;

  const isPositionOnly = changes.length === 1 && changes[0].field === 'Position';

  if (isPositionOnly) {
    // Debounce: many roles shift at once when a reorder happens.
    // Wait 600 ms after the last position event, then log a single summary.
    const guildId = newRole.guild.id;
    const existing = positionChangePending.get(guildId);
    if (existing) clearTimeout(existing);

    positionChangePending.set(
      guildId,
      setTimeout(async () => {
        positionChangePending.delete(guildId);
        // Wait 2 s for Discord to populate the audit log entry before fetching.
        await new Promise((r) => setTimeout(r, 2_000));
        const executor = await fetchAuditLogExecutor(newRole.guild, AuditLogEvent.RoleUpdate, null, 10_000);
        const payload  = buildRolesReorderedPayload(executor);
        await dispatchLog(client, newRole.guild.id, 'role', [], payload);
      }, 600),
    );

    // Antinuke still runs immediately (no debounce needed there).
    // No dangerous-permission change to check for position-only events.
    return;
  }

  // For non-position changes: wait 2 s so Discord populates the audit log,
  // then fetch — this fixes the "Updated by Unknown" issue.
  await new Promise<void>((resolve) => setTimeout(resolve, 2_000));

  const executor = await fetchAuditLogExecutor(newRole.guild, AuditLogEvent.RoleUpdate, newRole.id, 10_000);
  const payload  = buildRoleUpdatePayload(newRole, changes, executor);
  await dispatchLog(client, newRole.guild.id, 'role', [newRole.id], payload);

  const granted = grantedDangerousPermissions(oldRole.permissions, newRole.permissions);
  if (granted.length > 0) {
    const oldPermissions = oldRole.permissions?.bitfield;
    await checkAntinukeModule({
      client,
      guild: newRole.guild,
      module: 'roleUpdate',
      executor,
      actionDescription: `granted dangerous permission(s) to @${newRole.name ?? newRole.id}`,
      revert: async () => {
        await newRole.setPermissions(oldPermissions, 'Antinuke: reverting unauthorized dangerous permission grant');
      },
    });
  }
}
