// xoxo/commands/utility/purge-till.ts
//
// Delete the target message AND all messages sent after it in the current channel.
// Asks for confirmation first. The command message itself is excluded from deletion.
//
// Prefix:  $purge-till <message-id-or-link> [n]
//          $purge-till           (reply to a message — uses the replied-to message as target)
// Slash:   /purge-till target:<id-or-link> count:[n]
//
// If `n` is supplied → deletes the target + the NEXT n oldest messages after it.
// If `n` is omitted  → deletes the target + ALL messages after it.

import { PermissionFlagsBits } from 'discord.js';
import type { LevitateClient } from '../../structures/LevitateClient.js';
import { sendError, sendInfo, sendSuccess } from '../../components/statusMessages.js';
import { deleteFetched, scheduleCleanup } from '../../helpers/purgeHelper.js';
import { authorOnlyFilter } from '../../helpers/panelGuard.js';
import {
  buildPurgeConfirmPayload,
  buildPurgeTimedOutPayload,
  buildPurgeCancelledPayload,
} from '../../components/purgeConfirm.js';

export const options = {
  name:        'purge-till',
  aliases:     ['purgetill', 'pt'] as string[],
  description: 'Delete a target message and all messages after it in this channel.',
  usage: `purge-till <message-id-or-link>
purge-till <message-id-or-link> <n>
(or reply to a message and run purge-till with no args)`,
  category: 'utility',
  owner:    false,
  cooldown: 5,
};

const CLEANUP_DELAY = 3_000;
const MSG_LINK_RE   =
  /^https?:\/\/(?:ptb\.|canary\.)?discord(?:app)?\.com\/channels\/(\d+)\/(\d+)\/(\d+)\/?$/i;

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function parseTarget(
  token: string,
  currentChannelId: string,
): { messageId: string; sameChannel: boolean } | null {
  const trimmed = token.trim();
  if (/^\d{17,20}$/.test(trimmed)) return { messageId: trimmed, sameChannel: true };
  const m = trimmed.match(MSG_LINK_RE);
  if (!m) return null;
  const [, , cId, mId] = m;
  return { messageId: mId, sameChannel: cId === currentChannelId };
}

/**
 * Walk the channel forward from `afterId` and return up to `maxCount` messages
 * (oldest-first). The command message (excludeId) is always excluded.
 */
async function fetchMessagesAfter(
  channel:   any,
  afterId:   string,
  excludeId: string,
  maxCount:  number | null,
): Promise<any[]> {
  const collected: any[] = [];
  let after = afterId;

  while (true) {
    const batch = await channel.messages
      .fetch({ limit: 100, after })
      .catch((): null => null);
    if (!batch || batch.size === 0) break;

    const sorted = [...batch.values()].sort(
      (a: any, b: any) => a.createdTimestamp - b.createdTimestamp,
    );

    for (const m of sorted) {
      if (m.id === excludeId) continue;
      collected.push(m);
    }

    const newestId = sorted[sorted.length - 1]?.id;
    if (!newestId || batch.size < 100) break;
    after = newestId;

    if (maxCount !== null && collected.length >= maxCount) break;
  }

  return maxCount !== null ? collected.slice(0, maxCount) : collected;
}

// ─────────────────────────────────────────────────────────────────────────────
// Confirmation helpers
// ─────────────────────────────────────────────────────────────────────────────

async function askConfirmation(
  message:   any,
  desc:      string,
  onConfirm: () => Promise<void>,
): Promise<void> {
  const confirmId = `pt:confirm:${message.id}`;
  const cancelId  = `pt:cancel:${message.id}`;

  const confirmMsg = await message.channel
    .send(buildPurgeConfirmPayload(confirmId, cancelId, desc))
    .catch((): null => null);
  if (!confirmMsg) return;

  const collector = confirmMsg.createMessageComponentCollector({
    filter: (i: any) => authorOnlyFilter(
        i, message.author.id,
        (cid) => cid === confirmId || cid === cancelId,
      ),
    max:  1,
    time: 30_000,
  });

  collector.on('collect', async (i: any) => {
    await i.deferUpdate().catch((): null => null);
    if (i.customId === confirmId) {
      await confirmMsg.delete().catch((): null => null);
      await onConfirm();
    } else {
      await confirmMsg
        .edit(buildPurgeCancelledPayload(confirmId, cancelId, desc))
        .catch((): null => null);
      setTimeout(async () => {
        await confirmMsg.delete().catch((): null => null);
        await message.delete().catch((): null => null);
      }, CLEANUP_DELAY);
    }
  });

  collector.on('end', (_c: any, reason: string) => {
    if (reason !== 'time') return;
    confirmMsg
      .edit(buildPurgeTimedOutPayload(confirmId, cancelId, desc))
      .catch((): null => null);
  });
}

async function askConfirmationSlash(
  interaction: any,
  desc:        string,
  onConfirm:   () => Promise<void>,
): Promise<void> {
  const confirmId = `pt:confirm:${interaction.id}`;
  const cancelId  = `pt:cancel:${interaction.id}`;

  const confirmMsg: any = await interaction
    .editReply(buildPurgeConfirmPayload(confirmId, cancelId, desc))
    .catch((): null => null);
  if (!confirmMsg) return;

  const collector = confirmMsg.createMessageComponentCollector({
    filter: (i: any) => authorOnlyFilter(
        i, interaction.user.id,
        (cid) => cid === confirmId || cid === cancelId,
      ),
    max:  1,
    time: 30_000,
  });

  collector.on('collect', async (i: any) => {
    await i.deferUpdate().catch((): null => null);
    if (i.customId === confirmId) {
      await interaction.deleteReply().catch((): null => null);
      await onConfirm();
    } else {
      await interaction
        .editReply(buildPurgeCancelledPayload(confirmId, cancelId, desc))
        .catch((): null => null);
      setTimeout(() => interaction.deleteReply().catch((): null => null), CLEANUP_DELAY);
    }
  });

  collector.on('end', (_c: any, reason: string) => {
    if (reason !== 'time') return;
    interaction
      .editReply(buildPurgeTimedOutPayload(confirmId, cancelId, desc))
      .catch((): null => null);
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Prefix execute
// ─────────────────────────────────────────────────────────────────────────────

export async function prefixExecute(
  message: any,
  args:    string[],
  _client: LevitateClient,
): Promise<any> {
  const ctx = { message };

  if (!message.guild) return sendError(ctx, 'This command can only be used in a server.');

  const invokerPerms = message.channel.permissionsFor?.(message.member);
  if (!invokerPerms?.has?.(PermissionFlagsBits.ManageMessages)) {
    return sendError(ctx, 'You need the **Manage Messages** permission to use this command.');
  }

  const botPerms = message.channel.permissionsFor?.(message.guild.members.me);
  if (!botPerms?.has?.(PermissionFlagsBits.ManageMessages)) {
    return sendError(ctx, 'I need the **Manage Messages** permission to delete messages.');
  }

  let targetId: string;
  let amountArg: string | undefined;

  if (args.length === 0) {
    // Reply form — use the replied-to message as the target
    const refId: string | undefined = message.reference?.messageId;
    if (!refId) {
      return sendError(
        ctx,
        `No target provided. Either reply to a message or:\`\`\`\n${options.usage}\n\`\`\``,
      );
    }
    targetId = refId;
  } else {
    const parsed = parseTarget(args[0], message.channel.id);
    if (!parsed) return sendError(ctx, 'Invalid target. Provide a message ID or a Discord message link.');
    if (!parsed.sameChannel) return sendError(ctx, 'The target message link must point to **this** channel.');
    targetId  = parsed.messageId;
    amountArg = args[1];
  }

  let maxCount: number | null = null;
  if (amountArg !== undefined) {
    if (!/^\d+$/.test(amountArg)) return sendError(ctx, 'The count must be a positive number.');
    const n = parseInt(amountArg, 10);
    if (n <= 0) return sendError(ctx, 'The count must be a positive number.');
    maxCount = n;
  }

  const target = await message.channel.messages.fetch(targetId).catch((): null => null);
  if (!target) return sendError(ctx, 'Target message not found in this channel.');

  const desc = maxCount !== null
    ? `Are you sure you want to delete [this message](${target.url}) and the **next ${maxCount} messages** after it?`
    : `Are you sure you want to delete [this message](${target.url}) and **all messages** after it?`;

  return askConfirmation(message, desc, async () => {
    const after = await fetchMessagesAfter(message.channel, targetId, message.id, maxCount);
    // Include the target itself in the deletion
    const all   = [target, ...after].filter((m) => m.id !== message.id);

    if (all.length === 0) {
      const info = await sendInfo(ctx, 'No messages to delete.');
      scheduleCleanup(message, info, CLEANUP_DELAY);
      return;
    }

    const count = await deleteFetched(all);
    const reply = await sendSuccess(ctx, `Deleted **${count}** message${count !== 1 ? 's' : ''}.`);
    scheduleCleanup(message, reply, CLEANUP_DELAY);
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Slash execute
// ─────────────────────────────────────────────────────────────────────────────

export async function slashExecute(
  interaction: any,
  _client:     LevitateClient,
): Promise<any> {
  await interaction.deferReply();
  const ctx = { interaction };

  if (!interaction.guild) return sendError(ctx, 'This command can only be used in a server.');

  const invokerMember = interaction.member;
  if (!invokerMember?.permissions?.has?.(PermissionFlagsBits.ManageMessages)) {
    return sendError(ctx, 'You need the **Manage Messages** permission to use this command.');
  }

  const botMember = await interaction.guild.members.fetchMe().catch((): null => null);
  if (!botMember?.permissions?.has?.(PermissionFlagsBits.ManageMessages)) {
    return sendError(ctx, 'I need the **Manage Messages** permission to delete messages.');
  }

  const targetArg: string      = interaction.options.getString('target', true);
  const countArg:  number|null = interaction.options.getInteger('count');

  const parsed = parseTarget(targetArg, interaction.channelId);
  if (!parsed) return sendError(ctx, 'Invalid target. Provide a message ID or a Discord message link.');
  if (!parsed.sameChannel) return sendError(ctx, 'The target message link must point to **this** channel.');

  const maxCount: number | null = countArg ?? null;
  const channel: any = interaction.channel;

  const target = await channel.messages.fetch(parsed.messageId).catch((): null => null);
  if (!target) return sendError(ctx, 'Target message not found in this channel.');

  const desc = maxCount !== null
    ? `Are you sure you want to delete [this message](${target.url}) and the **next ${maxCount} messages** after it?`
    : `Are you sure you want to delete [this message](${target.url}) and **all messages** after it?`;

  return askConfirmationSlash(interaction, desc, async () => {
    const after = await fetchMessagesAfter(channel, parsed.messageId, '__none__', maxCount);
    const all   = [target, ...after];

    if (all.length === 0) {
      await sendInfo({ interaction, asReply: false } as any, 'No messages to delete.');
      return;
    }

    const count = await deleteFetched(all);
    await sendSuccess(
      { interaction, asReply: false } as any,
      `Deleted **${count}** message${count !== 1 ? 's' : ''}.`,
    );
  });
}
