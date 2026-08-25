// xoxo/events/discord/guildMemberUpdate.ts
//
// Fires when any guild member property changes.
// Used here to detect when a timeout expires NATURALLY so the user can be DMed.
//
// Key distinction:
//   Natural expiry  → old communicationDisabledUntil is in the PAST (time ran out)
//   Manual removal  → old communicationDisabledUntil is still in the FUTURE (removed early)
// We only DM on natural expiry; the untimeout command handles the manual-removal DM itself.
//
// Role-change logging: a 2-second pause is inserted before fetching the audit
// log so Discord has time to populate the entry — otherwise the executor
// shows as "Unknown".

import { AuditLogEvent } from 'discord.js';
import type { CassieClient } from '../../structures/CassieClient.js';
import { buildTimeoutExpiredDmPayload } from '../../components/moderation/timeout.js';
import { dispatchLog, fetchAuditLogExecutor } from '../../helpers/logDispatcher.js';
import {
  buildMemberNicknameUpdatePayload,
  buildMemberRolesUpdatePayload,
  buildMemberTimeoutSetPayload,
  buildMemberTimeoutRemovedPayload,
} from '../../components/logging/logMessages.js';

export const name = 'guildMemberUpdate';
export const once = false;

async function logNicknameChange(oldMember: any, newMember: any, client: CassieClient): Promise<void> {
  if (oldMember.nickname === newMember.nickname) return;
  // If there was no nickname before, fall back to the member's default display
  // name (global display name, or username) instead of showing "*None*".
  const before = oldMember.nickname ?? oldMember.displayName ?? oldMember.user?.username ?? '';
  const payload = buildMemberNicknameUpdatePayload(newMember, before, newMember.nickname ?? '');
  await dispatchLog(client, newMember.guild.id, 'member', [newMember.id], payload);
}

async function logRoleChange(oldMember: any, newMember: any, client: CassieClient): Promise<void> {
  const oldRoles = oldMember.roles?.cache;
  const newRoles = newMember.roles?.cache;
  if (!oldRoles || !newRoles) return;

  const added   = [...newRoles.values()].filter((r: any) => !oldRoles.has(r.id));
  const removed = [...oldRoles.values()].filter((r: any) => !newRoles.has(r.id));
  if (!added.length && !removed.length) return;

  // Wait 2 s for Discord to populate the audit log before fetching —
  // without this pause the executor often comes back as null ("Unknown").
  await new Promise<void>((resolve) => setTimeout(resolve, 2_000));

  const executor = await fetchAuditLogExecutor(newMember.guild, AuditLogEvent.MemberRoleUpdate, newMember.id, 10_000);
  const payload  = buildMemberRolesUpdatePayload(newMember, added, removed, executor);
  await dispatchLog(client, newMember.guild.id, 'member', [newMember.id], payload);
}

async function logTimeoutChange(oldMember: any, newMember: any, client: CassieClient): Promise<void> {
  const oldUntil = oldMember.communicationDisabledUntil;
  const newUntil = newMember.communicationDisabledUntil;
  if (String(oldUntil) === String(newUntil)) return;

  // Timeout newly set (or extended) by a moderator
  if (newUntil && (!oldUntil || new Date(newUntil).getTime() > new Date(oldUntil).getTime())) {
    const executor = await fetchAuditLogExecutor(newMember.guild, AuditLogEvent.MemberUpdate, newMember.id);
    const payload  = buildMemberTimeoutSetPayload(newMember, new Date(newUntil), '', executor);
    await dispatchLog(client, newMember.guild.id, 'member', [newMember.id], payload);
    return;
  }

  // Timeout manually removed early (natural expiry is handled separately below)
  const now = Date.now();
  const GRACE_MS = 10_000;
  if (oldUntil && !newUntil && new Date(oldUntil).getTime() > now + GRACE_MS) {
    const executor = await fetchAuditLogExecutor(newMember.guild, AuditLogEvent.MemberUpdate, newMember.id);
    const payload  = buildMemberTimeoutRemovedPayload(newMember, executor);
    await dispatchLog(client, newMember.guild.id, 'member', [newMember.id], payload);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Vanity role — server tag (clan tag) trigger
// ─────────────────────────────────────────────────────────────────────────────
//
// When a guild has the CLAN feature, members can equip the guild's server tag
// so it shows next to their username. When the `flags` bitfield on a member
// changes, we check whether they now have the server-tag bit set (or cleared).
//
// The flag for "guild identity / clan tag applied" is not yet a named constant
// in the version of discord-api-types bundled with discord.js@14.x in this
// project. We use the raw numeric value 32768 (1 << 15), which is the bit
// Discord sends for this state. If Discord changes this bit in a future API
// update, this constant is the only value to edit.
//
// The check is intentionally lenient: any flags change where the server-tag bit
// transitions from 0→1 (gain) or 1→0 (lose) triggers the vanity-role logic.

import { sendVanityRoleMessage, sendVanityRoleLoseMessage } from '../../components/utility/vanityRoleSender.js';

/** Raw bit value for "member has the guild's clan/server tag active". */
const SERVER_TAG_FLAG = 1 << 15; // 32768

async function handleServerTagRole(
  oldMember: any,
  newMember: any,
  client: CassieClient,
): Promise<void> {
  if (!client.db) return;
  if (newMember.user?.bot) return;

  const oldFlags = oldMember.flags?.bitfield ?? 0;
  const newFlags = newMember.flags?.bitfield ?? 0;

  const hadTag  = (oldFlags & SERVER_TAG_FLAG) !== 0;
  const hasTag  = (newFlags & SERVER_TAG_FLAG) !== 0;

  if (hadTag === hasTag) return; // no change in tag state

  const guild = newMember.guild;
  const settings = await client.db.getVanityRoleSettings(guild.id).catch((): null => null);
  if (!settings?.tag_role_id || settings.tag_enabled === false) return;

  const role = guild.roles.cache.get(settings.tag_role_id)
    ?? await guild.roles.fetch(settings.tag_role_id).catch((): null => null);
  if (!role) return;

  if (hasTag && !hadTag) {
    // Equipped the server tag → add role
    const added = await newMember.roles
      .add(role, 'Vanity role: server tag equipped')
      .catch((): null => null);
    if (added) {
      await sendVanityRoleMessage(newMember, client, settings, 'tag', 'gain').catch((): null => null);
    }
  } else if (!hasTag && hadTag) {
    // Unequipped the server tag → remove role
    const removed = await newMember.roles
      .remove(role, 'Vanity role: server tag unequipped')
      .catch((): null => null);
    if (removed) {
      await sendVanityRoleLoseMessage(newMember, client, settings, 'tag').catch((): null => null);
    }
  }
}

export async function execute(
  oldMember: any,
  newMember: any,
  client:    CassieClient,
): Promise<void> {
  if (newMember.guild) {
    await logNicknameChange(oldMember, newMember, client);
    await logRoleChange(oldMember, newMember, client);
    await logTimeoutChange(oldMember, newMember, client);
    await handleServerTagRole(oldMember, newMember, client);
  }

  const now = Date.now();

  // Must have had a timeout before and have none now
  if (!oldMember.communicationDisabledUntil) return;
  if (newMember.communicationDisabledUntil) return;

  const oldExpiryMs = new Date(oldMember.communicationDisabledUntil).getTime();

  // Only fire for natural expiry — the old timestamp is at or before now.
  // If it's still in the future, a moderator removed it manually; the command
  // already sent the "timeout removed" DM, so we skip here.
  const GRACE_MS = 10_000; // 10-second window to handle slight timing skew
  if (oldExpiryMs > now + GRACE_MS) return;

  // Timeout expired naturally — DM the user
  try {
    const dm = await newMember.user.createDM();
    await dm.send(buildTimeoutExpiredDmPayload(newMember.guild.name));
  } catch { /* DMs closed or user is a bot — ignore */ }
}
