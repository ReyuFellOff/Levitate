// xoxo/commands/moderation/unmute.ts
//
// Remove a timeout (untimeout) from one or more members.
//
// Prefix:  $unmute                   — lists all timed-out members with a
//                                     multi-select menu to pick who to untimeout
//          $unmute <@user|ID|username> [reason]
//                                   — untimeouts that specific member directly
//
// Slash:   /unmute                   — same no-arg list panel
//          /unmute user:<user> [reason]
//                                   — direct untimeout
//
// Checks:
//   • Invoker has ModerateMembers
//   • Bot has ModerateMembers
//   • Target is in the server and has an active timeout
//   • Target is not a bot developer
//   • Role hierarchy — bot must outrank the target

import { PermissionFlagsBits } from 'discord.js';
import type { LevitateClient } from '../../structures/LevitateClient.js';
import { sendError } from '../../components/statusMessages.js';
import {
  buildTimeoutRemovePayload,
  buildTimeoutRemoveDmPayload,
} from '../../components/moderation/timeout.js';
import {
  buildUnTimeoutListPayload,
  buildUnTimeoutResultPayload,
  registerUnTimeoutSession,
  type TimedOutEntry,
} from '../../components/moderation/untimeout.js';
import { buildModLogUnTimeout } from '../../components/moderation/modlog.js';
import { sendModLog } from '../../utils/modlogHelper.js';
import { resolveUser } from '../../helpers/userResolver.js';
import { confirmSlashAction } from '../../components/moderation/actionConfirm.js';
import { sendInvokeResponse } from '../../helpers/invoke.js';

export const options = {
  name:        'unmute',
  aliases:     ['untimeout', 'removetimeout'] as string[],
  description: 'Remove a timeout from one or more members.',
  usage:       'unmute [user] [reason]\n' +
               'No arguments — shows all timed-out members to pick from.\n' +
               'With user — removes timeout from that member directly.',
  category:    'moderation',
  owner:       false,
  cooldown:    3,
};

// ─────────────────────────────────────────────────────────────────────────────
// Shared helpers
// ─────────────────────────────────────────────────────────────────────────────

async function fetchTimedOutEntries(guild: any): Promise<TimedOutEntry[]> {
  const now = Date.now();

  // Use REST list (always fresh) rather than gateway member chunks, which can
  // be slow or return stale cache on the first call.
  const members = await guild.members.list({ limit: 1000 }).catch((): null => null);
  if (!members) return [];

  return [...members.values()]
    .filter((m: any) => m.communicationDisabledUntil && new Date(m.communicationDisabledUntil).getTime() > now)
    .map((m: any) => ({
      userId:    m.user.id,
      username:  m.user.username,
      expiresAt: new Date(m.communicationDisabledUntil),
    }))
    .sort((a: TimedOutEntry, b: TimedOutEntry) => a.expiresAt.getTime() - b.expiresAt.getTime());
}

async function directUnTimeout(opts: {
  targetUser:    any;
  guild:         any;
  invokerMember: any;
  botMember:     any;
  moderatorUsername: string;
  reason:        string;
  developers:    [string, string][];
  ctx:           { message?: any; interaction?: any };
}): Promise<any> {
  const { targetUser, guild, invokerMember, botMember, moderatorUsername, reason, developers, ctx } = opts;

  if (developers.some(([, id]) => id === targetUser.id))
    return sendError(ctx, 'You cannot untimeout a bot developer.');

  const targetMember = await guild.members.fetch(targetUser.id).catch((): null => null);
  if (!targetMember)
    return sendError(ctx, `**${targetUser.username}** is not in this server.`);

  if (!targetMember.communicationDisabledUntil)
    return sendError(ctx, `**${targetUser.username}** does not have an active timeout.`);

  const invokerIsOwner = (invokerMember?.id ?? invokerMember?.user?.id) === guild.ownerId;
  const invokerTop     = invokerMember?.roles?.highest?.position ?? 0;
  const targetTop      = targetMember.roles?.highest?.position   ?? 0;
  const botTop         = botMember?.roles?.highest?.position     ?? 0;

  if (!invokerIsOwner && targetTop >= invokerTop)
    return sendError(ctx, `You cannot untimeout **${targetUser.username}** — they have an equal or higher role than you.`);
  if (targetTop >= botTop)
    return sendError(ctx, `I cannot untimeout **${targetUser.username}** — their role is equal to or higher than mine.`);

  let dmSent = false;
  try {
    const dm = await targetUser.createDM();
    await dm.send(buildTimeoutRemoveDmPayload(guild.name, reason, moderatorUsername));
    dmSent = true;
  } catch { /* DMs closed */ }

  const removed = await targetMember.timeout(null, reason).catch((err: any): null => {
    console.error(`[untimeout] failed to remove timeout from ${targetUser.id}: ${err?.message ?? err}`);
    return null;
  });
  if (!removed) return sendError(ctx, `Failed to remove timeout from **${targetUser.username}**.`);

  return buildTimeoutRemovePayload(targetUser, reason, moderatorUsername, dmSent);
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
  if (!invokerPerms?.has?.(PermissionFlagsBits.ModerateMembers))
    return sendError(ctx, 'You need the **Timeout Members** permission to use this command.');

  const botMember = await message.guild.members.fetchMe().catch((): null => null);
  if (!botMember?.permissions?.has?.(PermissionFlagsBits.ModerateMembers))
    return sendError(ctx, 'I need the **Timeout Members** permission to untimeout members.');

  // No user arg — show multi-select list
  if (!args[0]) {
    const entries = await fetchTimedOutEntries(message.guild);
    if (entries.length === 0)
      return sendError(ctx, 'No members are currently timed out in this server.');

    const sent = await message.channel.send(buildUnTimeoutListPayload(entries));
    registerUnTimeoutSession(sent.id, message.author.id, message.guild.id);
    return;
  }

  // User arg — direct untimeout
  const targetUser = await resolveUser(client, message.guild, args[0]);
  if (!targetUser) return sendError(ctx, `Could not find a user matching \`${args[0]}\`.`);

  const reason = args.slice(1).join(' ').trim() || 'None provided.';
  const payload = await directUnTimeout({
    targetUser,
    guild:             message.guild,
    invokerMember:     message.member,
    botMember,
    moderatorUsername: message.author.username,
    reason,
    developers:        client.config.developers,
    ctx,
  });

  if (payload && typeof payload === 'object' && 'components' in payload) {
    sendModLog(client, message.guild.id, buildModLogUnTimeout(targetUser, reason, message.author.username));
    if (await sendInvokeResponse(ctx, client, 'unmute', { targetUser, reason })) return;
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
  if (!invokerMember?.permissions?.has?.(PermissionFlagsBits.ModerateMembers))
    return sendError(ctx, 'You need the **Timeout Members** permission to use this command.');

  const botMember = await interaction.guild.members.fetchMe().catch((): null => null);
  if (!botMember?.permissions?.has?.(PermissionFlagsBits.ModerateMembers))
    return sendError(ctx, 'I need the **Timeout Members** permission to untimeout members.');

  const targetUser = interaction.options.getUser('user') ?? null;

  // No user — show multi-select list
  if (!targetUser) {
    const entries = await fetchTimedOutEntries(interaction.guild);
    if (entries.length === 0)
      return sendError(ctx, 'No members are currently timed out in this server.');

    const sent = await interaction.editReply(buildUnTimeoutListPayload(entries));
    registerUnTimeoutSession(sent.id, interaction.user.id, interaction.guild.id);
    return;
  }

  // User provided — direct untimeout
  const reason = (interaction.options.getString('reason') ?? 'None provided.').trim() || 'None provided.';

  await confirmSlashAction({
    interaction,
    title:       'Confirm Remove Timeout',
    description: `Are you sure you want to remove the timeout from **${targetUser.username}**?\n-# Reason: ${reason}`,
    onConfirm: async () => {
      const payload = await directUnTimeout({
        targetUser,
        guild:             interaction.guild,
        invokerMember,
        botMember,
        moderatorUsername: interaction.user.username,
        reason,
        developers:        client.config.developers,
        ctx,
      });

      if (payload && typeof payload === 'object' && 'components' in payload) {
        sendModLog(client, interaction.guild.id, buildModLogUnTimeout(targetUser, reason, interaction.user.username));
        if (await sendInvokeResponse(ctx, client, 'unmute', { targetUser, reason })) return;
        await interaction.editReply(payload);
      }
    },
  });
}
