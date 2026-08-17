// xoxo/commands/features/reactionroles.ts
//
// $reactionroles / $rr
//   list
//   add <message ID or link> [reaction emoji] [role]
//   mode <single|multiple> <message ID or link>
//   remove <message ID or link> <reaction emoji or role>
//   removeall <message ID or link>
//   reset

import { PermissionFlagsBits } from 'discord.js';
import type { LevitateClient } from '../../structures/LevitateClient.js';
import type { ReactionRoleMessageDoc, ReactionRolePair } from '../../database/database.js';
import { sendError, sendInfo, sendSuccess } from '../../components/statusMessages.js';
import { sendWrongUsage } from '../../components/wrongUsage.js';
import {
  buildReactionRolesResetCancelledPayload,
  buildReactionRolesResetConfirmPayload,
  buildReactionRolesResetResultPayload,
  buildReactionRolesResetTimedOutPayload,
  startReactionRolePanel,
} from '../../components/features/reactionroles.js';
import { authorOnlyFilter } from '../../helpers/panelGuard.js';
import {
  REACTION_ROLE_MAX_MESSAGES,
  REACTION_ROLE_MAX_PAIRS,
  buildReactionRolePair,
  reactionRoleEmojiKey,
} from '../../helpers/reactionRoles.js';
import { resolveEmoji } from '../../helpers/emojiResolver.js';
import { resolveRole } from '../../helpers/roleResolver.js';

export const options = {
  name: 'reactionroles',
  aliases: ['rr', 'reactionrole', 'reaction-roles', 'reaction-role'] as string[],
  description: 'Manage reaction-based role assignments on existing messages.',
  usage: [
    'reactionroles list',
    'reactionroles add <message ID or link>',
    'reactionroles add <message ID or link> <emoji> <role>',
    'reactionroles mode single [message ID or link]',
    'reactionroles mode multiple [message ID or link]',
    'reactionroles remove <message ID or link> <emoji or role>',
    'reactionroles removeall <message ID or link>',
    'reactionroles reset',
  ].join('\n'),
  category: 'features',
  owner: false,
  cooldown: 3,
};

function canManageGuild(context: any): boolean {
  return !!context.member?.permissions?.has?.(PermissionFlagsBits.ManageGuild);
}

function statusContext(context: any): any {
  return context.isChatInputCommand?.()
    ? { interaction: context }
    : { message: context };
}

function parseMessageReference(input: string): { channelId?: string; messageId: string } | null {
  const link = input.match(/^https?:\/\/(?:canary\.|ptb\.)?discord(?:app)?\.com\/channels\/(\d+)\/(\d+)\/(\d+)\/?$/i);
  if (link) return { channelId: link[2], messageId: link[3] };
  if (/^\d{17,20}$/.test(input)) return { messageId: input };
  return null;
}

/**
 * A bare message ID is resolved in exactly one channel:
 * - an explicitly linked channel,
 * - the channel stored for an existing reaction-role record, or
 * - the channel where the command was sent.
 *
 * There is deliberately no server-wide channel scan.
 */
async function resolveTargetMessage(
  guild: any,
  input: string,
  fallbackChannel?: any,
  storedChannelId?: string,
): Promise<any | null> {
  const parsed = parseMessageReference(input);
  if (!parsed) return null;

  const channelId = parsed.channelId ?? storedChannelId ?? fallbackChannel?.id;
  if (!channelId) return null;

  const channel = guild.channels.cache.get(channelId)
    ?? await guild.channels.fetch(channelId).catch((): null => null);
  return channel?.messages
    ? channel.messages.fetch(parsed.messageId).catch((): null => null)
    : null;
}

function targetNotFoundMessage(
  input: string,
  checkedChannelId?: string,
  storedLookup = false,
): string {
  const parsed = parseMessageReference(input);
  if (parsed?.channelId || storedLookup) {
    const channelId = parsed?.channelId ?? checkedChannelId;
    return channelId
      ? `I couldn't find that message in <#${channelId}>. Check the message link and my View Channel and Read Message History permissions there.`
      : 'I couldn’t find that message. Check the message link and my channel permissions.';
  }

  if (checkedChannelId) {
    return [
      `I couldn't find message \`${input}\` in <#${checkedChannelId}>.`,
      'I checked this channel only. If the message is in another channel, run the command there or provide the full Discord message link.',
    ].join('\n');
  }

  return 'I couldn’t find that message. Use a message ID from this channel or a full Discord message link.';
}

function sendReactionRoleUsage(context: any, client: LevitateClient): Promise<any> {
  return sendWrongUsage(
    { message: context, client },
    options.name,
    options.usage,
  );
}

function channelPermissions(message: any, target: any): boolean {
  const permissions = target.channel?.permissionsFor?.(message.guild.members.me);
  return !!permissions?.has?.('ViewChannel')
    && !!permissions?.has?.('ReadMessageHistory')
    && !!permissions?.has?.('AddReactions');
}

function pairLines(guild: any, record: ReactionRoleMessageDoc): string {
  return record.pairs.map((pair) => {
    const role = guild.roles.cache.get(pair.role_id);
    return `${pair.emoji} : <@&${role?.id ?? pair.role_id}>`;
  }).join(', ');
}

async function listReactionRoles(message: any, client: LevitateClient): Promise<void> {
  const records = await client.db!.getReactionRoleMessages(message.guild.id);
  if (!records.length) {
    await sendInfo(statusContext(message), 'No reaction roles are configured in this server.');
    return;
  }

  const lines = records.map((record, index) =>
    `**${index + 1}.** <#${record.channel_id}> — \`${record.message_id}\` — **${record.allow_multiple === true ? 'Multiple' : 'Single'} selection**\n${pairLines(message.guild, record)}`,
  );
  await sendInfo(
    statusContext(message),
    `**Reaction Roles** (${records.length}/${REACTION_ROLE_MAX_MESSAGES} messages)\n\n${lines.join('\n\n')}`,
  );
}

async function addReactionRole(
  context: any,
  client: LevitateClient,
  args: string[],
): Promise<void> {
  const rawMessage = args[1];
  if (!rawMessage) {
    await sendReactionRoleUsage(context, client);
    return;
  }

  // Check the stored configuration first so an existing bare message ID can
  // resolve through its saved channel even when this command is run elsewhere.
  const parsed = parseMessageReference(rawMessage);
  const existing = parsed
    ? await client.db!.getReactionRoleMessage(context.guild.id, parsed.messageId)
    : null;
  const target = await resolveTargetMessage(
    context.guild,
    rawMessage,
    context.channel,
    existing?.channel_id,
  );
  if (!target) {
    await sendError(statusContext(context), targetNotFoundMessage(
      rawMessage,
      existing?.channel_id ?? context.channelId,
      !!existing?.channel_id,
    ));
    return;
  }
  if (!channelPermissions(context, target)) {
    await sendError(statusContext(context), 'I need View Channel, Read Message History, and Add Reactions in the target channel.');
    return;
  }

  if (args.length === 2) {
    const panelContext = context.isChatInputCommand?.() || context.interactionContext
      ? { interaction: context }
      : { message: context };
    await startReactionRolePanel(
      panelContext,
      client,
      target,
      existing?.pairs ?? [],
      existing?.allow_multiple === true,
    );
    return;
  }
  if (args.length < 4) {
    await sendReactionRoleUsage(context, client);
    return;
  }

  const rawRole = args.slice(3).join(' ');
  if (!existing) {
    const configured = await client.db!.getReactionRoleMessages(context.guild.id);
    if (configured.length >= REACTION_ROLE_MAX_MESSAGES) {
      await sendError(statusContext(context), `This server already has the maximum of ${REACTION_ROLE_MAX_MESSAGES} reaction-role messages.`);
      return;
    }
  }
  if (existing && existing.pairs.length >= REACTION_ROLE_MAX_PAIRS) {
    await sendError(statusContext(context), `A message can have at most ${REACTION_ROLE_MAX_PAIRS} reaction roles.`);
    return;
  }

  const pairResult = await buildReactionRolePair(
    client,
    context.guild,
    args[2],
    rawRole,
    context.author.id,
    existing?.pairs ?? [],
  );
  if (!pairResult.pair) {
    await sendError(statusContext(context), pairResult.error ?? 'That emoji-role pair is invalid.');
    return;
  }

  const result = await client.db!.saveReactionRoleMessage({
    guild_id: context.guild.id,
    channel_id: target.channelId,
    message_id: target.id,
    pairs: [...(existing?.pairs ?? []), pairResult.pair],
    allow_multiple: existing?.allow_multiple === true,
    created_by: context.author.id,
  });
  if (result === 'limit') {
    await sendError(statusContext(context), `This server already has the maximum of ${REACTION_ROLE_MAX_MESSAGES} reaction-role messages.`);
    return;
  }
  if (!result) {
    await sendError(statusContext(context), 'The reaction role could not be saved. Please try again.');
    return;
  }

  if (pairResult.emoji) {
    try {
      await target.react(pairResult.emoji as any);
    } catch {
      if (existing) {
        await client.db!.updateReactionRoleMessagePairs(context.guild.id, target.id, existing.pairs);
      } else {
        await client.db!.deleteReactionRoleMessage(context.guild.id, target.id);
      }
      await sendError(statusContext(context), 'I could not add that reaction. Check my Add Reactions permission and the emoji.');
      return;
    }
  }

  await sendSuccess(statusContext(context), `Added ${pairResult.pair.emoji} - <@&${pairResult.pair.role_id}> to \`${target.id}\`.`);
}

async function setReactionRoleMode(
  message: any,
  client: LevitateClient,
  args: string[],
): Promise<void> {
  const mode = args[1]?.toLowerCase();
  let rawMessage = args[2] ?? message.reference?.messageId;
  if ((mode !== 'single' && mode !== 'multiple') || args.length > 3) {
    await sendReactionRoleUsage(message, client);
    return;
  }

  if (!rawMessage) {
    const channelRecords = (await client.db!.getReactionRoleMessages(message.guild.id))
      .filter((record) => record.channel_id === message.channelId);
    if (channelRecords.length === 1) {
      rawMessage = channelRecords[0].message_id;
    } else {
      await sendError(
        statusContext(message),
        channelRecords.length > 1
          ? 'There is more than one reaction-role message in this channel. Reply to the target message or provide its message ID/link.'
          : 'Reply to the reaction-role message or provide its message ID/link.',
      );
      return;
    }
  }

  const { target, record } = await getTargetAndRecord(message, client, rawMessage);
  if (!target) {
    await sendError(statusContext(message), targetNotFoundMessage(
      rawMessage,
      record?.channel_id ?? message.channelId,
      !!record?.channel_id,
    ));
    return;
  }
  if (!record) {
    await sendError(statusContext(message), 'That message has no reaction roles configured.');
    return;
  }

  const allowMultiple = mode === 'multiple';
  if (record.allow_multiple === allowMultiple) {
    await sendInfo(
      statusContext(message),
      `Reaction roles on \`${target.id}\` are already set to **${allowMultiple ? 'multiple' : 'single'} selection**.`,
    );
    return;
  }

  const updated = await client.db!.updateReactionRoleMessageMode(
    message.guild.id,
    target.id,
    allowMultiple,
  );
  if (!updated) {
    await sendError(statusContext(message), 'The reaction-role mode could not be updated. Please try again.');
    return;
  }

  await sendSuccess(
    statusContext(message),
    `Reaction roles on \`${target.id}\` now use **${allowMultiple ? 'multiple' : 'single'} selection**.`,
  );
}

async function getTargetAndRecord(
  message: any,
  client: LevitateClient,
  input: string,
): Promise<{ target: any | null; record: ReactionRoleMessageDoc | null }> {
  const parsed = parseMessageReference(input);
  const record = parsed
    ? await client.db!.getReactionRoleMessage(message.guild.id, parsed.messageId)
    : null;
  const target = await resolveTargetMessage(
    message.guild,
    input,
    message.channel,
    record?.channel_id,
  );
  return { target, record };
}

async function removeReactionRole(
  message: any,
  client: LevitateClient,
  args: string[],
): Promise<void> {
  const { target, record: storedRecord } = await getTargetAndRecord(message, client, args[1]);
  if (!target) {
    await sendError(statusContext(message), targetNotFoundMessage(
      args[1],
      storedRecord?.channel_id ?? message.channelId,
      !!storedRecord?.channel_id,
    ));
    return;
  }
  const record = storedRecord ?? await client.db!.getReactionRoleMessage(message.guild.id, target.id);
  if (!record) {
    await sendError(statusContext(message), 'That message has no reaction roles configured.');
    return;
  }

  const selector = args.slice(2).join(' ').trim();
  let pair: ReactionRolePair | undefined;
  const resolvedEmoji = selector
    ? await resolveEmoji(client, selector, message.guild)
    : null;
  if (resolvedEmoji) {
    pair = record.pairs.find((candidate) => candidate.emoji_key === reactionRoleEmojiKey(resolvedEmoji));
  }
  if (!pair) {
    const role = resolveRole(message.guild, selector);
    pair = record.pairs.find((candidate) => candidate.role_id === role?.id);
  }
  if (!pair) {
    await sendError(statusContext(message), 'No reaction role matched that emoji or role.');
    return;
  }

  const remaining = record.pairs.filter((candidate) => candidate !== pair);
  const reaction = target.reactions.cache.find((candidate: any) =>
    reactionRoleEmojiKey(candidate.emoji) === pair!.emoji_key);
  await reaction?.remove?.().catch?.((): null => null);

  if (!remaining.length) {
    await client.db!.deleteReactionRoleMessage(message.guild.id, target.id);
  } else {
    await client.db!.updateReactionRoleMessagePairs(message.guild.id, target.id, remaining);
  }
  await sendSuccess(statusContext(message), `Removed ${pair.emoji} - <@&${pair.role_id}> from \`${target.id}\`.`);
}

async function removeAllReactionRoles(message: any, client: LevitateClient, args: string[]): Promise<void> {
  const { target, record: storedRecord } = await getTargetAndRecord(message, client, args[1]);
  if (!target) {
    await sendError(statusContext(message), targetNotFoundMessage(
      args[1],
      storedRecord?.channel_id ?? message.channelId,
      !!storedRecord?.channel_id,
    ));
    return;
  }
  const record = storedRecord ?? await client.db!.getReactionRoleMessage(message.guild.id, target.id);
  if (!record) {
    await sendError(statusContext(message), 'That message has no reaction roles configured.');
    return;
  }

  await Promise.all([...target.reactions.cache.values()]
    .filter((reaction: any) => record.pairs.some((pair) => pair.emoji_key === reactionRoleEmojiKey(reaction.emoji)))
    .map((reaction: any) => reaction.remove?.().catch?.((): null => null)));
  await client.db!.deleteReactionRoleMessage(message.guild.id, target.id);
  await sendSuccess(statusContext(message), `Removed all reaction roles from \`${target.id}\`.`);
}

async function resolveStoredReactionRoleMessage(
  guild: any,
  record: ReactionRoleMessageDoc,
): Promise<any | null> {
  return resolveTargetMessage(guild, record.message_id, undefined, record.channel_id);
}

async function resetReactionRoles(message: any, client: LevitateClient): Promise<void> {
  const records = await client.db!.getReactionRoleMessages(message.guild.id);
  if (!records.length) {
    await sendInfo(statusContext(message), 'No reaction roles are configured in this server.');
    return;
  }

  const confirmId = `rrreset:confirm:${message.id}`;
  const cancelId = `rrreset:cancel:${message.id}`;
  const confirmMsg = await message.channel
    .send(buildReactionRolesResetConfirmPayload(confirmId, cancelId, records.length))
    .catch((): null => null);
  if (!confirmMsg) return;

  const collector = confirmMsg.createMessageComponentCollector({
    filter: (interaction: any) => authorOnlyFilter(
      interaction,
      message.author.id,
      (customId) => customId === confirmId || customId === cancelId,
    ),
    max: 1,
    time: 30_000,
  });

  collector.on('collect', async (interaction: any) => {
    await interaction.deferUpdate().catch((): null => null);
    if (interaction.customId === cancelId) {
      await confirmMsg.edit(buildReactionRolesResetCancelledPayload(
        confirmId,
        cancelId,
        records.length,
      )).catch((): null => null);
      return;
    }

    const availability = await Promise.all(records.map(async (record) => {
      const target = await resolveStoredReactionRoleMessage(message.guild, record);
      if (!target) return false;
      await Promise.all([...target.reactions.cache.values()]
        .filter((reaction: any) => record.pairs.some((pair) => pair.emoji_key === reactionRoleEmojiKey(reaction.emoji)))
        .map((reaction: any) => reaction.remove?.().catch((): null => null)));
      return true;
    }));
    await client.db!.deleteAllReactionRoleMessages(message.guild.id);
    const available = availability.filter(Boolean).length;
    await confirmMsg.edit(buildReactionRolesResetResultPayload(
      records.length,
      records.length - available,
    )).catch((): null => null);
  });

  collector.on('end', (_collected: any, reason: string) => {
    if (reason !== 'time') return;
    confirmMsg.edit(buildReactionRolesResetTimedOutPayload(
      confirmId,
      cancelId,
      records.length,
    )).catch((): null => null);
  });
}

export async function prefixExecute(message: any, args: string[], client: LevitateClient): Promise<void> {
  if (!message.guild) {
    await sendError({ message }, 'This command can only be used in a server.');
    return;
  }
  if (!canManageGuild(message)) {
    await sendError({ message }, 'You need the **Manage Server** permission to manage reaction roles.');
    return;
  }
  if (!client.db) {
    await sendError({ message }, 'Database is unavailable right now.');
    return;
  }

  switch (args[0]?.toLowerCase()) {
    case 'list':
      if (args.length !== 1) return sendReactionRoleUsage(message, client);
      return listReactionRoles(message, client);
    case 'add':
    case 'create':
      return addReactionRole(message, client, args);
    case 'mode':
      return setReactionRoleMode(message, client, args);
    case 'remove':
      if (!args[1] || !args[2]) {
        await sendReactionRoleUsage(message, client);
        return;
      }
      return removeReactionRole(message, client, args);
    case 'removeall':
      if (!args[1] || args.length !== 2) {
        await sendReactionRoleUsage(message, client);
        return;
      }
      return removeAllReactionRoles(message, client, args);
    case 'reset':
      if (args.length !== 1) return sendReactionRoleUsage(message, client);
      return resetReactionRoles(message, client);
    default:
      await sendReactionRoleUsage(message, client);
      return;
  }
}