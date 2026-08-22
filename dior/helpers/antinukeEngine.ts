import { config } from '../config.js';
// xoxo/helpers/antinukeEngine.ts
//
// Core antinuke runtime. Event files call `checkAntinukeModule()` whenever a
// watched action happens; this module handles whitelist checks, in-memory
// rate tracking, punishment execution, best-effort reverts, and log dispatch.
//
// Threshold model: actions accumulate in a per-executor bucket. Old entries
// (> MAX_TRACKED_AGE_MS) are pruned on each push. The `interval_ms` field in
// the DB is stored for backward-compatibility but is no longer used to filter
// the window — the bucket itself (pruned at 5 minutes) IS the window. This
// prevents the old bypass where an attacker could space actions 11 s apart
// and never trip a 10-s window.

import {
  MessageFlags,
  PermissionsBitField,
} from 'discord.js';
import type { Guild, GuildMember, User } from 'discord.js';
import type { LevitateClient } from '../structures/LevitateClient.js';
import type {
  AntinukeConfigDoc,
  AntinukeModuleKey,
  AntinukePunishment,
} from '../database/database.js';
import { getAntinukeModuleInfo } from '../config/antinukeModules.js';
import { buildAntinukeTriggerContainer } from '../components/antinuke/antinuke.js';

// ─────────────────────────────────────────────────────────────────────────────
// In-memory state (per-process; antinuke reacts to live gateway events on this
// shard and does not need to survive a restart).
// ─────────────────────────────────────────────────────────────────────────────

interface TrackedAction {
  timestamp: number;
  revert?: () => Promise<void>;
}

/** guildId -> module -> executorId -> actions */
const actionLog = new Map<string, Map<AntinukeModuleKey, Map<string, TrackedAction[]>>>();

/** guildId -> executorId -> punishedUntil (ms epoch) — de-dupes cascading events. */
const recentlyPunished = new Map<string, Map<string, number>>();

const MAX_TRACKED_AGE_MS = 5 * 60_000;
const PUNISH_COOLDOWN_MS = 15_000;

function getActionBucket(guildId: string, module: AntinukeModuleKey, executorId: string): TrackedAction[] {
  let guildMap = actionLog.get(guildId);
  if (!guildMap) { guildMap = new Map(); actionLog.set(guildId, guildMap); }
  let moduleMap = guildMap.get(module);
  if (!moduleMap) { moduleMap = new Map(); guildMap.set(module, moduleMap); }
  let bucket = moduleMap.get(executorId);
  if (!bucket) { bucket = []; moduleMap.set(executorId, bucket); }
  return bucket;
}

function clearActionBucket(guildId: string, module: AntinukeModuleKey, executorId: string): void {
  actionLog.get(guildId)?.get(module)?.delete(executorId);
}

function isRecentlyPunished(guildId: string, executorId: string): boolean {
  const until = recentlyPunished.get(guildId)?.get(executorId);
  return !!until && until > Date.now();
}

function markPunished(guildId: string, executorId: string): void {
  let guildMap = recentlyPunished.get(guildId);
  if (!guildMap) { guildMap = new Map(); recentlyPunished.set(guildId, guildMap); }
  guildMap.set(executorId, Date.now() + PUNISH_COOLDOWN_MS);
}

// ─────────────────────────────────────────────────────────────────────────────
// Whitelist
// ─────────────────────────────────────────────────────────────────────────────

export function isAntinukeWhitelisted(
  config: AntinukeConfigDoc,
  guild: Guild,
  executor: User | GuildMember | null | undefined,
): boolean {
  if (!executor) return true;
  const id = executor.id;
  if (id === guild.client.user?.id) return true;
  if (id === guild.ownerId) return true;

  const isBot = 'bot' in executor ? executor.bot : (executor as GuildMember).user?.bot;

  for (const entry of config.whitelist) {
    if (entry.type === 'user' && entry.id === id) return true;
    if (entry.type === 'bot' && isBot && entry.id === id) return true;
  }

  const member = 'roles' in executor && 'cache' in (executor as GuildMember).roles ? (executor as GuildMember) : null;
  if (member) {
    for (const entry of config.whitelist) {
      if (entry.type === 'role' && member.roles.cache.has(entry.id)) return true;
    }
  }

  return false;
}

// ─────────────────────────────────────────────────────────────────────────────
// Dangerous permission detection (used by roleUpdate hook)
// ─────────────────────────────────────────────────────────────────────────────

export const DANGEROUS_PERMISSION_FLAGS = [
  PermissionsBitField.Flags.Administrator,
  PermissionsBitField.Flags.ManageGuild,
  PermissionsBitField.Flags.ManageRoles,
  PermissionsBitField.Flags.ManageChannels,
  PermissionsBitField.Flags.ManageWebhooks,
  PermissionsBitField.Flags.BanMembers,
  PermissionsBitField.Flags.KickMembers,
  PermissionsBitField.Flags.MentionEveryone,
] as const;

export function grantedDangerousPermissions(before: Readonly<PermissionsBitField>, after: Readonly<PermissionsBitField>): bigint[] {
  const granted: bigint[] = [];
  for (const flag of DANGEROUS_PERMISSION_FLAGS) {
    if (!before.has(flag) && after.has(flag)) granted.push(flag as bigint);
  }
  return granted;
}

// ─────────────────────────────────────────────────────────────────────────────
// Quarantine role
// ─────────────────────────────────────────────────────────────────────────────

export async function ensureQuarantineRole(client: LevitateClient, guild: Guild, config: AntinukeConfigDoc): Promise<string | null> {
  if (config.quarantine_role_id) {
    const existing = await guild.roles.fetch(config.quarantine_role_id).catch((): null => null);
    if (existing) return existing.id;
  }

  try {
    const role = await guild.roles.create({
      name: 'Quarantined',
      color: 0x2b2d31,
      permissions: [],
      hoist: false,
      mentionable: false,
      reason: 'Antinuke: auto-created quarantine role',
    });

    for (const channel of guild.channels.cache.values()) {
      const overwrites = (channel as any).permissionOverwrites;
      if (!overwrites?.edit) continue;
      await overwrites
        .edit(role, { SendMessages: false, Speak: false, AddReactions: false, Connect: false }, { reason: 'Antinuke: lock quarantine role out of channels' })
        .catch((): null => null);
    }

    await client.db?.setAntinukeQuarantineRole(guild.id, role.id).catch((): null => null);
    return role.id;
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Punishment execution
// ─────────────────────────────────────────────────────────────────────────────

async function executePunishment(
  client: LevitateClient,
  guild: Guild,
  executorId: string,
  punishment: AntinukePunishment,
  config: AntinukeConfigDoc,
  reason: string,
): Promise<string> {
  if (punishment === 'none') return 'No punishment configured — logged only.';

  if (punishment === 'ban') {
    try {
      await guild.members.ban(executorId, { reason });
      return `Banned <@${executorId}>.`;
    } catch {
      return `Failed to ban <@${executorId}> (insufficient permissions or role hierarchy).`;
    }
  }

  const member = await guild.members.fetch(executorId).catch((): null => null);
  if (!member) return `Could not fetch <@${executorId}> — they may have already left.`;

  if (punishment === 'kick') {
    try {
      await member.kick(reason);
      return `Kicked <@${executorId}>.`;
    } catch {
      return `Failed to kick <@${executorId}> (insufficient permissions or role hierarchy).`;
    }
  }

  if (punishment === 'strip') {
    try {
      const removable = member.roles.cache.filter((r) => r.id !== guild.id && r.editable);
      await member.roles.remove(removable, reason);
      return `Stripped ${removable.size} role(s) from <@${executorId}>.`;
    } catch {
      return `Failed to strip roles from <@${executorId}>.`;
    }
  }

  if (punishment === 'quarantine') {
    const roleId = await ensureQuarantineRole(client, guild, config);
    if (!roleId) return `Failed to create/find quarantine role for <@${executorId}>.`;
    try {
      const removable = member.roles.cache.filter((r) => r.id !== guild.id && r.editable);
      await member.roles.remove(removable, reason).catch((): null => null);
      await member.roles.add(roleId, reason);
      return `Quarantined <@${executorId}>.`;
    } catch {
      return `Failed to quarantine <@${executorId}> (insufficient permissions or role hierarchy).`;
    }
  }

  return 'No action taken.';
}

// ─────────────────────────────────────────────────────────────────────────────
// Log dispatch  (reference1 logSendHandler style — section + thumbnail)
// ─────────────────────────────────────────────────────────────────────────────

async function dispatchAntinukeLog(
  client: LevitateClient,
  guild: Guild,
  config: AntinukeConfigDoc,
  moduleName: string,
  executorId: string,
  executorAvatarUrl: string,
  actionDescription: string,
  punishmentResult: string,
  revertedCount: number,
  revertFailures: number,
): Promise<void> {
  if (!config.log_channel_id) return;
  const channel = await guild.channels.fetch(config.log_channel_id).catch((): null => null);
  if (!channel || !('send' in channel) || typeof (channel as any).send !== 'function') return;

  const container = buildAntinukeTriggerContainer(
    moduleName,
    executorId,
    executorAvatarUrl,
    actionDescription,
    punishmentResult,
    revertedCount,
    revertFailures,
  );

  await (channel as any)
    .send({ components: [container], flags: MessageFlags.IsComponentsV2, allowedMentions: { parse: [] } })
    .catch((): null => null);
}

// ─────────────────────────────────────────────────────────────────────────────
// Main entry point
// ─────────────────────────────────────────────────────────────────────────────

export interface AntinukeCheckOptions {
  client:     LevitateClient;
  guild:      Guild;
  module:     AntinukeModuleKey;
  executor:   User | GuildMember | null | undefined;
  /** Human-readable description of the specific action, e.g. "created channel #general". */
  actionDescription: string;
  /** If provided and the module trips, this is called to undo the specific action (best-effort). */
  revert?: () => Promise<void>;
}

/**
 * Records the action and, if the guild's config for this module trips
 * (bucket.length >= limit), executes the configured punishment, reverts
 * every tracked action in the burst that supplied a `revert` callback,
 * and posts a summary to the antinuke log channel.
 *
 * The `interval_ms` field in the DB is ignored at runtime — the only
 * pruning window is MAX_TRACKED_AGE_MS (5 min). This eliminates the old
 * "space actions 11 seconds apart to never trip a 10-second window" bypass.
 */
export async function checkAntinukeModule(opts: AntinukeCheckOptions): Promise<void> {
  const { client, guild, module, executor, actionDescription, revert } = opts;
  if (!client.db || !executor) return;

  const config = await client.db.getAntinukeConfig(guild.id).catch((): null => null);
  if (!config || !config.enabled) return;

  const moduleCfg = config.modules[module];
  if (!moduleCfg || !moduleCfg.enabled) return;

  if (isAntinukeWhitelisted(config, guild, executor)) return;
  if (isRecentlyPunished(guild.id, executor.id)) return;

  const info = getAntinukeModuleInfo(module);
  const bucket = getActionBucket(guild.id, module, executor.id);
  const now = Date.now();

  bucket.push({ timestamp: now, revert });
  // Prune entries older than 5 minutes (natural inactivity cleanup)
  while (bucket.length && now - bucket[0]!.timestamp > MAX_TRACKED_AGE_MS) bucket.shift();

  // Trip condition: bucket length >= limit (no interval_ms window — prevents
  // the bypass where an attacker spaces actions just outside the old window).
  const tripped = info?.thresholdBased === false ? true : bucket.length >= moduleCfg.limit;
  if (!tripped) return;

  // Snapshot the bucket before clearing so we can revert and log correctly.
  const toRevert = [...bucket];
  markPunished(guild.id, executor.id);
  clearActionBucket(guild.id, module, executor.id);

  const reason = `Antinuke: ${info?.displayName ?? module} tripped — ${actionDescription}`;
  const punishmentResult = await executePunishment(client, guild, executor.id, moduleCfg.punishment, config, reason);

  let revertedCount = 0;
  let revertFailures = 0;
  for (const action of toRevert) {
    if (!action.revert) continue;
    try {
      await action.revert();
      revertedCount += 1;
    } catch {
      revertFailures += 1;
    }
  }

  // Executor avatar URL for the log thumbnail
  const executorAvatarUrl =
    (executor as any).displayAvatarURL?.({ size: 128, forceStatic: true }) ??
    `https://cdn.discordapp.com/embed/avatars/${Number(BigInt(executor.id) >> 22n) % 5}.png`;

  await dispatchAntinukeLog(
    client,
    guild,
    config,
    info?.displayName ?? module,
    executor.id,
    executorAvatarUrl,
    actionDescription,
    punishmentResult,
    revertedCount,
    revertFailures,
  );
}
