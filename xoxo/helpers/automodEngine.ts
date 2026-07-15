// xoxo/helpers/automodEngine.ts
//
// Real-time automod scanner. Called on every guild message.
// Checks the server's automod config, evaluates each enabled module,
// and executes the configured punishment.
//
// Caches configs for 30s to avoid a DB round-trip on every message.

import { PermissionFlagsBits, ContainerBuilder, TextDisplayBuilder, MessageFlags } from 'discord.js';
import type { LevitateClient } from '../structures/LevitateClient.js';
import type { AutomodConfigDoc } from '../database/database.js';
import { automodPunishmentLabels } from '../config/automodModules.js';

// ─────────────────────────────────────────────────────────────────────────────
// Config cache (per-guild, 30s TTL)
// ─────────────────────────────────────────────────────────────────────────────

const configCache = new Map<string, { doc: AutomodConfigDoc; ts: number }>();
const CONFIG_TTL  = 30_000;

function getCached(guildId: string): AutomodConfigDoc | undefined {
  const entry = configCache.get(guildId);
  if (entry && Date.now() - entry.ts < CONFIG_TTL) return entry.doc;
  configCache.delete(guildId);
  return undefined;
}

export function invalidateAutomodCache(guildId: string): void {
  configCache.delete(guildId);
}

// ─────────────────────────────────────────────────────────────────────────────
// Spam tracker (in-memory, pruned every 2 hours)
// ─────────────────────────────────────────────────────────────────────────────

/** guildId-userId → array of message timestamps (ms) */
const spamTracker = new Map<string, number[]>();

setInterval(() => {
  const now     = Date.now();
  const cutoff  = now - 7_200_000; // 2 h
  for (const [key, times] of spamTracker) {
    const fresh = times.filter((t) => t > cutoff);
    if (fresh.length === 0) spamTracker.delete(key);
    else spamTracker.set(key, fresh);
  }
}, 120_000).unref();

function trackSpam(guildId: string, userId: string, windowMs: number): number {
  const key  = `${guildId}-${userId}`;
  const now  = Date.now();
  const prev = (spamTracker.get(key) ?? []).filter((t) => now - t < windowMs);
  prev.push(now);
  spamTracker.set(key, prev);
  return prev.length;
}

// ─────────────────────────────────────────────────────────────────────────────
// Regexes
// ─────────────────────────────────────────────────────────────────────────────

const LINK_RE   = /https?:\/\/[^\s]+/i;
const INVITE_RE = /(discord\.(gg|io|me|li)|discordapp\.com\/invite|discord\.com\/invite)\/[a-zA-Z0-9-]+/i;

// ─────────────────────────────────────────────────────────────────────────────
// Whitelist check
// ─────────────────────────────────────────────────────────────────────────────

function isWhitelisted(config: AutomodConfigDoc, message: any): boolean {
  if (!config.whitelist?.length) return false;
  const authorId  = message.author.id;
  const channelId = message.channel.id;
  const roleIds   = [...(message.member?.roles?.cache?.keys() ?? [])];

  for (const entry of config.whitelist) {
    if (entry.type === 'user'    && entry.id === authorId)              return true;
    if (entry.type === 'channel' && entry.id === channelId)             return true;
    if (entry.type === 'role'    && roleIds.includes(entry.id))         return true;
  }
  return false;
}

// ─────────────────────────────────────────────────────────────────────────────
// Punishment executor
// ─────────────────────────────────────────────────────────────────────────────

async function executePunishment(
  message: any,
  config:  AutomodConfigDoc,
  reason:  string,
  client:  LevitateClient,
): Promise<void> {
  // Always delete the offending message first
  await message.delete().catch((): null => null);

  const member = message.member;
  if (!member) return;

  // Guard: don't punish admins or people with Manage Messages
  const perms = message.channel.permissionsFor?.(member);
  if (perms?.has(PermissionFlagsBits.Administrator))   return;
  if (perms?.has(PermissionFlagsBits.ManageMessages)) return;

  const punishment = config.punishment;

  if (punishment === 'warn') {
    await message.author.send(`**You were warned in ${message.guild.name}:** ${reason}`).catch((): null => null);
  } else if (punishment === 'timeout') {
    const durationMs = (config.timeout_duration ?? 300) * 1_000;
    await member.timeout(durationMs, `AutoMod: ${reason}`).catch((): null => null);
  } else if (punishment === 'kick') {
    await member.kick(`AutoMod: ${reason}`).catch((): null => null);
  } else if (punishment === 'ban') {
    await message.guild.members.ban(message.author.id, { reason: `AutoMod: ${reason}` }).catch((): null => null);
  }
  // 'delete' = message already deleted above

  await sendAutomodLog(message, config, reason, punishment, client);
}

// ─────────────────────────────────────────────────────────────────────────────
// Log dispatch
// ─────────────────────────────────────────────────────────────────────────────

async function sendAutomodLog(
  message:    any,
  config:     AutomodConfigDoc,
  reason:     string,
  punishment: string,
  client:     LevitateClient,
): Promise<void> {
  if (!config.log_channel_id) return;

  const channel = await client.channels.fetch(config.log_channel_id).catch((): null => null);
  if (!channel || typeof (channel as any).send !== 'function') return;

  const punishLabel = automodPunishmentLabels[punishment as keyof typeof automodPunishmentLabels] ?? punishment;
  const content =
    `## AutoMod Action\n` +
    `**User:** <@${message.author.id}> (\`${message.author.tag ?? message.author.username}\`)\n` +
    `**Channel:** <#${message.channel.id}>\n` +
    `**Rule:** ${reason}\n` +
    `**Action:** ${punishLabel}\n` +
    (message.content ? `**Message:** ${message.content.slice(0, 400)}` : '');

  const container = new ContainerBuilder().addTextDisplayComponents(
    new TextDisplayBuilder().setContent(content),
  );
  await (channel as any).send({
    components: [container],
    flags: MessageFlags.IsComponentsV2,
    allowedMentions: { parse: [] },
  }).catch((): null => null);
}

// ─────────────────────────────────────────────────────────────────────────────
// Main entry point
// ─────────────────────────────────────────────────────────────────────────────

export async function runAutomod(message: any, client: LevitateClient): Promise<void> {
  if (!client.db) return;
  const guildId = message.guild?.id;
  if (!guildId) return;

  // Config (cached)
  let config = getCached(guildId);
  if (!config) {
    config = await client.db.getAutomodConfig(guildId).catch((): null => null) as AutomodConfigDoc | null;
    if (!config) return;
    configCache.set(guildId, { doc: config, ts: Date.now() });
  }

  if (!config.enabled) return;
  if (isWhitelisted(config, message)) return;

  const content  = message.content ?? '';
  const modules  = config.modules;

  // ── Anti-Spam ───────────────────────────────────────────────────────────────
  if (modules.antiSpam) {
    const windowMs = (config.spam_interval ?? 5) * 1_000;
    const count    = trackSpam(guildId, message.author.id, windowMs);
    if (count > (config.spam_threshold ?? 5)) {
      await executePunishment(message, config, `Spam (${count} messages / ${config.spam_interval ?? 5}s)`, client);
      return;
    }
  }

  // ── Anti-Invite ─────────────────────────────────────────────────────────────
  if (modules.antiInvite && INVITE_RE.test(content)) {
    await executePunishment(message, config, 'Discord invite link', client);
    return;
  }

  // ── Anti-Link ───────────────────────────────────────────────────────────────
  if (modules.antiLink && LINK_RE.test(content) && !INVITE_RE.test(content)) {
    await executePunishment(message, config, 'External link', client);
    return;
  }

  // ── Anti-Bad Words ──────────────────────────────────────────────────────────
  if (modules.antiBadWords && config.bad_words?.length) {
    const lower = content.toLowerCase();
    const hit   = config.bad_words.find((w) => lower.includes(w.toLowerCase()));
    if (hit) {
      await executePunishment(message, config, `Blacklisted word`, client);
      return;
    }
  }

  // ── Anti-Mass Mention ───────────────────────────────────────────────────────
  if (modules.antiMassMention) {
    const mentions = message.mentions.users.size + message.mentions.roles.size;
    if (mentions > (config.mention_limit ?? 5)) {
      await executePunishment(message, config, `Mass mention (${mentions} pings)`, client);
      return;
    }
  }

  // ── Anti-Ping (@everyone / @here) ───────────────────────────────────────────
  if (modules.antiPing && message.mentions.everyone) {
    const member = message.member;
    const perms  = message.channel.permissionsFor?.(member);
    if (!perms?.has(PermissionFlagsBits.MentionEveryone)) {
      await executePunishment(message, config, '@everyone / @here ping', client);
      return;
    }
  }

  // ── Anti-Caps ───────────────────────────────────────────────────────────────
  if (modules.antiCaps && content.length >= (config.caps_min_length ?? 10)) {
    const letters  = content.replace(/[^a-zA-Z]/g, '');
    if (letters.length > 0) {
      const capsPercent = (letters.replace(/[^A-Z]/g, '').length / letters.length) * 100;
      if (capsPercent > (config.caps_percentage ?? 70)) {
        await executePunishment(message, config, `Excessive caps (${Math.round(capsPercent)}%)`, client);
        return;
      }
    }
  }
}
