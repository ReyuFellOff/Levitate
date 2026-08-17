// xoxo/commands/moderation/unban.ts
//
// Unban a user from this server.
//
// Prefix:  $unban                       — lists all banned users with a
//                                          multi-select menu to pick who to unban
//          $unban <userId|mention|username> [reason]
//                                        — unbans that specific user directly
//
// Slash:   /unban                       — same no-arg list panel
//          /unban user:<user> [reason]  — direct unban
//
// Checks:
//   • Invoker has BanMembers
//   • Bot has BanMembers
//   • Target is actually banned in this server
//
// No confirmation needed — unban is a reversible action.

import { PermissionFlagsBits } from 'discord.js';
import type { LevitateClient } from '../../structures/LevitateClient.js';
import { sendError } from '../../components/statusMessages.js';
import {
  buildUnbanListPayload,
  buildUnbanResultPayload,
  buildUnbanSuccessPayload,
  buildUnbanDmPayload,
  registerUnbanSession,
  type BannedEntry,
} from '../../components/moderation/unban.js';
import { buildModLogUnban } from '../../components/moderation/modlog.js';
import { sendModLog } from '../../utils/modlogHelper.js';

export const options = {
  name:        'unban',
  aliases:     [] as string[],
  description: 'Unban a user from this server.',
  usage:       'unban [userId|mention|username] [reason]\n' +
               'No arguments — shows all banned users to pick from.\n' +
               'With user — unbans that user directly.',
  category:    'moderation',
  owner:       false,
  cooldown:    3,
};

// ─────────────────────────────────────────────────────────────────────────────
// Shared helpers
// ─────────────────────────────────────────────────────────────────────────────

async function fetchBannedEntries(guild: any): Promise<BannedEntry[]> {
  const bans = await guild.bans.fetch().catch((): null => null);
  if (!bans) return [];

  return [...bans.values()].map((b: any) => ({
    userId:   b.user.id,
    username: b.user.username,
    reason:   b.reason ?? 'No reason provided.',
  }));
}

/**
 * Resolve a ban target from a raw argument. Banned users cannot be mentioned
 * normally, but a mention-formatted or plain snowflake ID is still accepted.
 * Username lookups fall back to the guild's own ban list since the user is
 * not a member and can't be searched via the guild member cache.
 */
async function resolveBanTarget(client: LevitateClient, guild: any, arg: string): Promise<any | null> {
  const trimmed = arg.trim();
  if (!trimmed) return null;

  const mentionMatch = trimmed.match(/^<@!?(\d+)>$/);
  const idCandidate = mentionMatch ? mentionMatch[1] : (/^\d{17,20}$/.test(trimmed) ? trimmed : null);

  if (idCandidate) {
    return client.users.fetch(idCandidate).catch((): null => null);
  }

  const bans = await guild.bans.fetch().catch((): null => null);
  if (!bans) return null;

  const lower = trimmed.toLowerCase();
  const match = [...bans.values()].find((b: any) => b.user.username.toLowerCase() === lower);
  return match ? match.user : null;
}

async function directUnban(opts: {
  targetUser:        any;
  guild:             any;
  moderatorUsername: string;
  reason:            string;
  ctx:               { message?: any; interaction?: any };
}): Promise<any> {
  const { targetUser, guild, moderatorUsername, reason, ctx } = opts;

  const banEntry = await guild.bans.fetch(targetUser.id).catch((): null => null);
  if (!banEntry)
    return sendError(ctx, `**${targetUser.username}** is not banned in this server.`);

  const unbanned = await guild.bans.remove(targetUser.id, reason).then(() => true).catch((err: any) => {
    console.error(`[unban] failed to unban ${targetUser.id}: ${err?.message ?? err}`);
    return false;
  });
  if (!unbanned)
    return sendError(ctx, `Failed to unban **${targetUser.username}**. Check my permissions.`);

  try {
    const dm = await targetUser.createDM();
    await dm.send(buildUnbanDmPayload(guild.name, reason, moderatorUsername));
  } catch { /* DMs closed or no mutual server — non-fatal */ }

  return buildUnbanSuccessPayload(targetUser, reason, moderatorUsername);
}

// ─────────────────────────────────────────────────────────────────────────────
// Prefix
// ─────────────────────────────────────────────────────────────────────────────

export async function prefixExecute(
  message: any,
  args:    string[],
  client:  LevitateClient,
): Promise<any> {
  const ctx = { message };

  if (!message.guild) return sendError(ctx, 'This command can only be used in a server.');

  const invokerPerms = message.channel.permissionsFor?.(message.member);
  if (!invokerPerms?.has?.(PermissionFlagsBits.BanMembers))
    return sendError(ctx, 'You need the **Ban Members** permission to use this command.');

  const botMember = await message.guild.members.fetchMe().catch((): null => null);
  if (!botMember?.permissions?.has?.(PermissionFlagsBits.BanMembers))
    return sendError(ctx, 'I need the **Ban Members** permission to unban users.');

  // No user arg — show multi-select list
  if (!args[0]) {
    const entries = await fetchBannedEntries(message.guild);
    if (entries.length === 0)
      return sendError(ctx, 'There are no banned users in this server.');

    const sent = await message.channel.send(buildUnbanListPayload(entries));
    registerUnbanSession(sent.id, message.author.id, message.guild.id);
    return;
  }

  // User arg — direct unban
  const targetUser = await resolveBanTarget(client, message.guild, args[0]);
  if (!targetUser) return sendError(ctx, `Could not find a banned user matching \`${args[0]}\`.`);

  const reason = args.slice(1).join(' ').trim() || 'None provided.';
  const payload = await directUnban({
    targetUser,
    guild:             message.guild,
    moderatorUsername: message.author.username,
    reason,
    ctx,
  });

  if (payload && typeof payload === 'object' && 'components' in payload) {
    sendModLog(client, message.guild.id, buildModLogUnban(targetUser, reason, message.author.username));
    return message.channel.send(payload);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Slash
// ─────────────────────────────────────────────────────────────────────────────

export async function slashExecute(
  interaction: any,
  client:      LevitateClient,
): Promise<any> {
  await interaction.deferReply();
  const ctx = { interaction };

  if (!interaction.guild) return sendError(ctx, 'This command can only be used in a server.');

  const invokerMember = interaction.member;
  if (!invokerMember?.permissions?.has?.(PermissionFlagsBits.BanMembers))
    return sendError(ctx, 'You need the **Ban Members** permission to use this command.');

  const botMember = await interaction.guild.members.fetchMe().catch((): null => null);
  if (!botMember?.permissions?.has?.(PermissionFlagsBits.BanMembers))
    return sendError(ctx, 'I need the **Ban Members** permission to unban users.');

  const targetUser = interaction.options.getUser('user') ?? null;

  // No user — show multi-select list
  if (!targetUser) {
    const entries = await fetchBannedEntries(interaction.guild);
    if (entries.length === 0)
      return sendError(ctx, 'There are no banned users in this server.');

    const sent = await interaction.editReply(buildUnbanListPayload(entries));
    registerUnbanSession(sent.id, interaction.user.id, interaction.guild.id);
    return;
  }

  // User provided — direct unban
  const reason = (interaction.options.getString('reason') ?? 'None provided.').trim() || 'None provided.';
  const payload = await directUnban({
    targetUser,
    guild:             interaction.guild,
    moderatorUsername: interaction.user.username,
    reason,
    ctx,
  });

  if (payload && typeof payload === 'object' && 'components' in payload) {
    sendModLog(client, interaction.guild.id, buildModLogUnban(targetUser, reason, interaction.user.username));
    return interaction.editReply(payload);
  }
}
