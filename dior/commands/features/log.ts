// xoxo/commands/logging/log.ts
//
// Configure the logging system for this server.
//
// Prefix:  $log                             — home menu
//          $log <category>                  — jump to that category's panel
//          $log <category> <#channel>       — directly set log channel
//          $log <category> enable           — enable that category
//          $log <category> disable          — disable that category
//
//          <category> accepts: all, channel, member, role, vc, message, server
//
// Slash:   /log [category]  — opens the interactive panel (unchanged)
//
// Requires: Manage Server permission.

import type { CassieClient } from '../../structures/CassieClient.js';
import { sendError, sendSuccess } from '../../components/statusMessages.js';
import {
  buildLogHomePayload,
  buildLogAllPayload,
  buildLogCategoryPayload,
  registerLogMenuSession,
} from '../../components/logging/logMenu.js';
import { logCategories } from '../../config/logging/logCategories.js';
import type { LogCategoryKey } from '../../database/database.js';
import { PermissionFlagsBits } from 'discord.js';

export const options = {
  name: 'log',
  aliases: ['logs', 'logging'] as string[],
  description: 'Configure server logging (channel, member, role, vc, message, server, or all).',
  usage: 'log [category] [#channel|enable|disable]',
  category: 'features',
  owner: false,
  cooldown: 3,
};

const VALID_KEYS = ['all', ...logCategories.map((c) => c.key)];

/** Human-readable label for each category key — used in success messages. */
const CATEGORY_LABELS: Record<string, string> = {
  all: 'All',
  ...Object.fromEntries(logCategories.map((c) => [c.key, c.label])),
};

async function resolvePayload(client: CassieClient, guildId: string, arg?: string) {
  const key = arg?.toLowerCase();
  if (!key) return { page: 'home' as const, payload: await buildLogHomePayload(client, guildId, false) };
  if (!VALID_KEYS.includes(key)) return null;
  if (key === 'all') return { page: 'all' as const, payload: await buildLogAllPayload(client, guildId, false) };
  return {
    page: key as any,
    payload: await buildLogCategoryPayload(client, guildId, key as any, false),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Prefix
// ─────────────────────────────────────────────────────────────────────────────

export async function prefixExecute(
  message: any,
  args: string[],
  client: CassieClient,
): Promise<any> {
  const ctx = { message };
  if (!message.guild) return sendError(ctx, 'This command can only be used in a server.');

  if (!message.member?.permissions?.has?.(PermissionFlagsBits.ManageGuild))
    return sendError(ctx, 'You need the **Manage Server** permission to configure logging.');

  const catArg = args[0]?.toLowerCase();
  const subArg = args[1]?.toLowerCase();

  // No category → home panel
  if (!catArg) {
    const resolved = await resolvePayload(client, message.guild.id, undefined);
    const sent = await message.channel.send(resolved!.payload);
    registerLogMenuSession(sent.id, { page: resolved!.page, guildId: message.guild.id, channelId: sent.channelId, client });
    return;
  }

  // Unknown category
  if (!VALID_KEYS.includes(catArg))
    return sendError(ctx, `Unknown log category \`${catArg}\`. Valid options: ${VALID_KEYS.map((k) => `\`${k}\``).join(', ')}.`);

  // No second arg → open that category's interactive panel
  if (!subArg) {
    const resolved = await resolvePayload(client, message.guild.id, catArg);
    const sent = await message.channel.send(resolved!.payload);
    registerLogMenuSession(sent.id, { page: resolved!.page, guildId: message.guild.id, channelId: sent.channelId, client });
    return;
  }

  // ── enable / disable ────────────────────────────────────────────────────
  if (subArg === 'enable' || subArg === 'disable') {
    if (!client.db) return sendError(ctx, 'Database is unavailable right now.');

    const enabled = subArg === 'enable';
    if (catArg === 'all') {
      await client.db.setLogAllEnabled(message.guild.id, enabled);
    } else {
      await client.db.setLogCategoryEnabled(message.guild.id, catArg as LogCategoryKey, enabled);
    }

    const label = CATEGORY_LABELS[catArg] ?? catArg;
    return sendSuccess(ctx, `**${label}** logging ${enabled ? 'enabled' : 'disabled'}.`);
  }

  // ── set channel ─────────────────────────────────────────────────────────
  // Accept a mention (<#id>) or a raw channel ID.
  const raw = args[1];
  const mentionMatch = raw.match(/^<#(\d+)>$/);
  const channelId = mentionMatch?.[1] ?? (/^\d{17,20}$/.test(raw) ? raw : null);

  if (!channelId)
    return sendError(ctx, `\`${raw}\` is not a recognised channel, \`enable\`, or \`disable\`.\n**Usage:** \`${client.config.prefix}log ${catArg} <#channel|enable|disable>\``);

  const channel = message.guild.channels.cache.get(channelId)
    ?? await message.guild.channels.fetch(channelId).catch((): null => null);

  if (!channel)
    return sendError(ctx, 'Channel not found. Make sure I have access to it.');

  if (!channel.isTextBased?.())
    return sendError(ctx, 'Log channel must be a text channel.');

  if (!client.db) return sendError(ctx, 'Database is unavailable right now.');

  if (catArg === 'all') {
    await client.db.setLogAllChannel(message.guild.id, channelId);
  } else {
    await client.db.setLogCategoryChannel(message.guild.id, catArg as LogCategoryKey, channelId);
  }

  const label = CATEGORY_LABELS[catArg] ?? catArg;
  return sendSuccess(ctx, `**${label}** log channel set to <#${channelId}>.`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Slash — unchanged: opens the interactive panel only
// ─────────────────────────────────────────────────────────────────────────────

export async function slashExecute(
  interaction: any,
  client: CassieClient,
): Promise<any> {
  const ctx = { interaction };
  if (!interaction.guild) return sendError(ctx, 'This command can only be used in a server.');

  if (!interaction.member?.permissions?.has?.(PermissionFlagsBits.ManageGuild))
    return sendError(ctx, 'You need the **Manage Server** permission to configure logging.');

  const category = interaction.options.getString('category') ?? undefined;
  const resolved = await resolvePayload(client, interaction.guild.id, category);
  if (!resolved)
    return sendError(ctx, `Unknown log category \`${category}\`. Valid options: ${VALID_KEYS.map((k) => `\`${k}\``).join(', ')}.`);

  const sent = await interaction.reply({ ...resolved.payload, fetchReply: true });
  registerLogMenuSession(sent.id, { page: resolved.page, guildId: interaction.guild.id, channelId: interaction.channelId, client });
}
