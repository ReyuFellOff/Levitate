// xoxo/commands/moderation/softban.ts
//
// Ban and immediately unban a member, deleting their recent messages in the
// process.
//
// Prefix:  $softban <@user|ID|username> [history] [reason]
// Slash:   /softban user:<user> [history] [reason]

import { PermissionFlagsBits } from 'discord.js';
import type { LevitateClient } from '../../structures/LevitateClient.js';
import { sendError } from '../../components/statusMessages.js';
import { buildSoftbanSuccessPayload } from '../../components/moderation/softban.js';
import { buildModLogSoftban } from '../../components/moderation/modlog.js';
import { sendModLog } from '../../utils/modlogHelper.js';
import { resolveUser } from '../../helpers/userResolver.js';
import { confirmSlashAction } from '../../components/moderation/actionConfirm.js';
import { sendInvokeResponse } from '../../helpers/invoke.js';

export const options = {
  name:        'softban',
  aliases:     [] as string[],
  description: 'Ban then unban a member from the server.',
  usage:       'softban <@user|ID|username> [history] [reason]\n' +
               'History: none · 1h · 6h · 12h · 1d · 3d · 7d (default: 7d).',
  category:    'moderation',
  owner:       false,
  cooldown:    3,
};

const HISTORY_CHOICES = {
  none: 0,
  '1h': 60 * 60,
  '6h': 6 * 60 * 60,
  '12h': 12 * 60 * 60,
  '1d': 24 * 60 * 60,
  '3d': 3 * 24 * 60 * 60,
  '7d': 7 * 24 * 60 * 60,
} as const;

const DEFAULT_HISTORY = '7d';

type HistoryChoice = keyof typeof HISTORY_CHOICES;

function historyLabel(choice: HistoryChoice): string {
  return {
    none: 'Don’t delete any',
    '1h': 'Previous hour',
    '6h': 'Previous 6 hours',
    '12h': 'Previous 12 hours',
    '1d': 'Previous 24 hours',
    '3d': 'Previous 3 days',
    '7d': 'Previous 7 days',
  }[choice];
}

function parseHistory(input: string | undefined): {
  choice: HistoryChoice;
  consumed: boolean;
  error?: string;
} {
  if (!input) return { choice: DEFAULT_HISTORY, consumed: false };

  const value = input.trim().toLowerCase();
  const aliases: Record<string, HistoryChoice> = {
    '0': 'none',
    '0s': 'none',
    off: 'none',
    '1h': '1h',
    hour: '1h',
    '6h': '6h',
    '12h': '12h',
    '1d': '1d',
    '24h': '1d',
    '3d': '3d',
    '7d': '7d',
  };
  const choice = aliases[value];

  if (!choice) {
    if (/^\d/.test(value)) {
      return {
        choice: DEFAULT_HISTORY,
        consumed: true,
        error: 'History must be one of `none`, `1h`, `6h`, `12h`, `1d`, `3d`, or `7d`.',
      };
    }
    return { choice: DEFAULT_HISTORY, consumed: false };
  }

  return { choice, consumed: true };
}

function resolveReasonAndHistory(args: string[]): {
  historyChoice: HistoryChoice;
  reason: string;
  error?: string;
} {
  const history = parseHistory(args[1]);
  if (history.error) return { historyChoice: DEFAULT_HISTORY, reason: '', error: history.error };

  const reasonArgs = history.consumed ? args.slice(2) : args.slice(1);
  return {
    historyChoice: history.choice,
    reason: reasonArgs.join(' ').trim() || 'No reason provided.',
  };
}

async function getTargetAndCheck(opts: {
  guild:         any;
  targetUser:    any;
  invokerId:     string;
  invokerMember: any;
  botMember:     any;
  developers:    [string, string][];
}): Promise<{ member: any } | { error: string }> {
  const { guild, targetUser, invokerId, invokerMember, botMember, developers } = opts;

  if (targetUser.id === invokerId)           return { error: 'You cannot softban yourself.' };
  if (targetUser.id === guild.ownerId)       return { error: 'You cannot softban the server owner.' };
  if (targetUser.id === botMember?.user?.id) return { error: 'I cannot softban myself.' };
  if (developers.some(([, id]) => id === targetUser.id))
    return { error: 'You cannot softban a bot developer.' };

  const targetMember = await guild.members.fetch(targetUser.id).catch((): null => null);
  if (!targetMember)
    return { error: `**${targetUser.username}** is not in this server — softban requires a current member.` };

  const invokerIsOwner = invokerId === guild.ownerId;
  const invokerTop     = invokerMember?.roles?.highest?.position ?? 0;
  const targetTop      = targetMember.roles?.highest?.position   ?? 0;
  const botTop         = botMember?.roles?.highest?.position     ?? 0;

  if (!invokerIsOwner && targetTop >= invokerTop)
    return { error: `You cannot softban **${targetUser.username}** — they have an equal or higher role than you.` };
  if (targetTop >= botTop)
    return { error: `I cannot softban **${targetUser.username}** — their role is equal to or higher than mine.` };
  if (!targetMember.bannable)
    return { error: `I cannot softban **${targetUser.username}** — missing permissions.` };

  return { member: targetMember };
}

async function performSoftban(
  guild: any,
  targetUser: any,
  reason: string,
  historyChoice: HistoryChoice,
): Promise<'success' | 'ban-failed' | 'unban-failed'> {
  const banned = await guild.members
    .ban(targetUser.id, {
      reason,
      deleteMessageSeconds: HISTORY_CHOICES[historyChoice],
    })
    .catch((err: any): null => {
      console.error(`[softban] failed to ban ${targetUser.id}: ${err?.message ?? err}`);
      return null;
    });

  if (!banned) return 'ban-failed';

  const unbanned = await guild.bans.remove(targetUser.id, reason).then(() => true).catch((err: any) => {
    console.error(`[softban] failed to unban ${targetUser.id}: ${err?.message ?? err}`);
    return false;
  });

  return unbanned ? 'success' : 'unban-failed';
}

async function finishSoftban(
  ctx: { message?: any; interaction?: any },
  client: LevitateClient,
  targetUser: any,
  reason: string,
  historyChoice: HistoryChoice,
  moderatorUsername: string,
  guild: any,
): Promise<void> {
  const invoked = await sendInvokeResponse(ctx, client, 'softban', { targetUser, reason });
  if (!invoked) {
    const payload = buildSoftbanSuccessPayload(targetUser, reason, historyChoice, moderatorUsername);
    if (ctx.interaction) await ctx.interaction.editReply(payload);
    else await ctx.message.channel.send(payload);
  }

  sendModLog(client, guild.id, buildModLogSoftban(targetUser, reason, historyChoice, moderatorUsername));
}

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
    return sendError(ctx, 'I need the **Ban Members** permission to softban members.');

  if (!args[0])
    return sendError(ctx, `**Usage:** \`${client.config.prefix}${options.usage}\``);

  const targetUser = await resolveUser(client, message.guild, args[0]);
  if (!targetUser) return sendError(ctx, `Could not find a user matching \`${args[0]}\`.`);

  const parsed = resolveReasonAndHistory(args);
  if (parsed.error) return sendError(ctx, parsed.error);
  const { historyChoice, reason } = parsed;
  const result = await getTargetAndCheck({
    guild:         message.guild,
    targetUser,
    invokerId:     message.author.id,
    invokerMember: message.member,
    botMember,
    developers:    client.config.developers,
  });
  if ('error' in result) return sendError(ctx, result.error);

  const outcome = await performSoftban(message.guild, targetUser, reason, historyChoice);
  if (outcome === 'ban-failed')
    return sendError(ctx, `Failed to softban **${targetUser.username}**. Check my permissions and role position.`);
  if (outcome === 'unban-failed')
    return sendError(ctx, `**${targetUser.username}** was banned and their messages were cleaned up, but I could not unban them. Please unban them manually.`);

  await finishSoftban(ctx, client, targetUser, reason, historyChoice, message.author.username, message.guild);
}

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
    return sendError(ctx, 'I need the **Ban Members** permission to softban members.');

  const targetUser = interaction.options.getUser('user', true);
  const historyInput = interaction.options.getString('history') ?? DEFAULT_HISTORY;
  const history = parseHistory(historyInput);
  if (history.error) return sendError(ctx, history.error);
  const historyChoice = history.choice;
  const reason = (interaction.options.getString('reason') ?? 'No reason provided.').trim() || 'No reason provided.';
  const result = await getTargetAndCheck({
    guild:         interaction.guild,
    targetUser,
    invokerId:     interaction.user.id,
    invokerMember,
    botMember,
    developers:    client.config.developers,
  });
  if ('error' in result) return sendError(ctx, result.error);

  await confirmSlashAction({
    interaction,
    title:       'Confirm Softban',
    description: `Are you sure you want to softban **${targetUser.username}**?\n-# ${historyLabel(historyChoice)}.\n-# Reason: ${reason}`,
    onConfirm: async () => {
      const outcome = await performSoftban(interaction.guild, targetUser, reason, historyChoice);
      if (outcome === 'ban-failed') {
        await sendError(ctx, `Failed to softban **${targetUser.username}**. Check my permissions and role position.`);
        return;
      }
      if (outcome === 'unban-failed') {
        await sendError(ctx, `**${targetUser.username}** was banned and their messages were cleaned up, but I could not unban them. Please unban them manually.`);
        return;
      }

      await finishSoftban(ctx, client, targetUser, reason, historyChoice, interaction.user.username, interaction.guild);
    },
  });
}