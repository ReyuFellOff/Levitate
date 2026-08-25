// xoxo/events/discord/presenceUpdate.ts
//
// Fires whenever a guild member's presence changes (online state, activities,
// custom status text, etc.).
//
// Vanity-role STATUS trigger:
//   If the guild has a status_keyword configured and status_enabled is true,
//   and a member's custom status (ActivityType.Custom = 4) now contains that
//   keyword (case-insensitive), the bot gives them status_role_id. When the
//   keyword is no longer present the role is removed.
//
// Requires the GuildPresences privileged intent (declared in CassieClient.ts)
// and must be enabled in the Discord Developer Portal.
//
// Robustness notes:
//   • newPresence.member can be null for uncached members; we use userId+fetch.
//   • DB is queried per event; high-volume servers may benefit from caching.

import { ActivityType } from 'discord.js';
import type { CassieClient } from '../../structures/CassieClient.js';
import { sendVanityRoleMessage, sendVanityRoleLoseMessage } from '../../components/utility/vanityRoleSender.js';

export const name = 'presenceUpdate';
export const once = false;

export async function execute(
  _oldPresence: any,
  newPresence:  any,
  client:       CassieClient,
): Promise<void> {
  // Must be a guild presence
  if (!newPresence?.guild) return;
  if (!client.db) return;

  // Resolve member via userId — more reliable than newPresence.member which
  // can be null when the member is not in the guild cache at event time.
  const userId = newPresence.userId ?? newPresence.user?.id;
  if (!userId) return;

  const guild = newPresence.guild;

  // Skip bots
  const userFromCache = client.users.cache.get(userId);
  if (userFromCache?.bot) return;

  // Load vanity role settings for this guild
  const settings = await client.db.getVanityRoleSettings(guild.id).catch((): null => null);
  if (!settings) return;

  // ── Status trigger guard ──────────────────────────────────────────────────
  // Treat undefined as enabled so pre-existing docs without the field work correctly.
  if (settings.status_enabled === false) return;
  if (!settings.status_keyword || !settings.status_role_id) return;

  // Fetch the role — bail if it no longer exists in this guild
  const role =
    guild.roles.cache.get(settings.status_role_id) ??
    (await guild.roles.fetch(settings.status_role_id).catch((): null => null));
  if (!role) return;

  // Extract the custom status text.
  // Discord stores the user-typed status in the `state` field of the Custom activity.
  const activities: any[] = newPresence.activities ?? [];
  const customActivity    = activities.find((a: any) => a.type === ActivityType.Custom);
  const statusText        = (customActivity?.state ?? '').toLowerCase();

  const keyword    = settings.status_keyword.toLowerCase();
  const hasKeyword = statusText.includes(keyword);

  // Fetch the guild member — cache first, then HTTP if needed
  const member: any =
    guild.members.cache.get(userId) ??
    (await guild.members.fetch(userId).catch((): null => null));
  if (!member) return;
  if (member.user?.bot) return;

  const hasRole = member.roles.cache.has(settings.status_role_id);

  if (hasKeyword && !hasRole) {
    const added = await member.roles
      .add(role, `Vanity role: status contains "${settings.status_keyword}"`)
      .catch((): null => null);
    if (added) {
      await sendVanityRoleMessage(member, client, settings, 'status', 'gain').catch((): null => null);
    }
  } else if (!hasKeyword && hasRole) {
    const removed = await member.roles
      .remove(role, `Vanity role: status no longer contains "${settings.status_keyword}"`)
      .catch((): null => null);
    if (removed) {
      await sendVanityRoleLoseMessage(member, client, settings, 'status').catch((): null => null);
    }
  }
}
