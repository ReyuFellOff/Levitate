// xoxo/commands/utility/purge.ts
//
// Bulk-delete messages in the current channel.
//
// "Command message" = the user's prefix message that invoked this command.
// Cleanup order on every successful prefix path:
//   1. Run the actual deletion
//   2. Send the success/info reply
//   3. After 3 seconds, delete the command message AND the reply together.

import type { LevitateClient } from '../../structures/LevitateClient.js';
import { sendError, sendInfo, sendSuccess } from '../../components/statusMessages.js';
import { resolveUser } from '../../helpers/userResolver.js';
import { authorOnlyFilter } from '../../helpers/panelGuard.js';
import {
  parseTextTerms,
  fetchFilteredMessages,
  fetchMessagesBetween,
  stripReactions,
  deleteFetched,
  scheduleCleanup,
} from '../../helpers/purgeHelper.js';
import {
  buildPurgeConfirmPayload,
  buildPurgeTimedOutPayload,
  buildPurgeCancelledPayload,
} from '../../components/purgeConfirm.js';

export const options = {
  name: 'purge',
  aliases: [] as string[],
  description: 'Bulk-delete messages in the current channel.',
  usage: `purge all
purge amount <n>
purge <n>
purge bot [amount]
purge humans [amount]
purge user <@user|ID|username> [amount]
purge images [amount]
purge files [amount]
purge links [amount]
purge text <"term1"> ["term2"] ...
purge link <message-link>`,
  category: 'utility',
  owner: false,
  cooldown: 5,
};

const CLEANUP_DELAY = 3000;
const MSG_LINK_RE =
  /^https?:\/\/(?:ptb\.|canary\.)?discord(?:app)?\.com\/channels\/(\d+)\/(\d+)\/(\d+)\/?$/i;

/** Accept a raw snowflake ID or a Discord message link. Returns the message ID
 *  and whether it belongs to the given channel. */
function parseMessageRef(
  token: string,
  channelId: string,
): { id: string; sameChannel: boolean } | null {
  const t = token.trim();
  if (/^\d{17,20}$/.test(t)) return { id: t, sameChannel: true };
  const m = t.match(MSG_LINK_RE);
  if (!m) return null;
  return { id: m[3], sameChannel: m[2] === channelId };
}

async function askConfirmation(
  message: any,
  description: string,
  onConfirm: () => Promise<void>,
): Promise<any> {
  const confirmId = `purge:confirm:${message.id}`;
  const cancelId  = `purge:cancel:${message.id}`;

  const confirmMsg = await message.channel.send(
    buildPurgeConfirmPayload(confirmId, cancelId, description),
  ).catch((): null => null);
  if (!confirmMsg) return;

  const collector = confirmMsg.createMessageComponentCollector({
    filter: (i: any) => authorOnlyFilter(
        i, message.author.id,
        (cid) => cid === confirmId || cid === cancelId,
      ),
    max: 1,
    time: 30_000,
  });

  collector.on('collect', async (i: any) => {
    await i.deferUpdate().catch((): null => null);
    if (i.customId === confirmId) {
      await confirmMsg.delete().catch((): null => null);
      await onConfirm();
    } else {
      await confirmMsg
        .edit(buildPurgeCancelledPayload(confirmId, cancelId, description))
        .catch((): null => null);
      setTimeout(async () => {
        await confirmMsg.delete().catch((): null => null);
        await message.delete().catch((): null => null);
      }, 3000);
    }
  });

  collector.on('end', (_collected: any, reason: string) => {
    if (reason !== 'time') return;
    confirmMsg
      .edit(buildPurgeTimedOutPayload(confirmId, cancelId, description))
      .catch((): null => null);
  });
}

async function runFilteredDelete(
  ctx: any,
  channel: any,
  excludeId: string,
  filter: (msg: any) => boolean,
  maxCount: number | null,
  emptyMsg: string,
  cleanupTarget: any | null,
): Promise<any> {
  const msgs = await fetchFilteredMessages(channel, excludeId, filter, maxCount);
  if (msgs.length === 0) {
    const info = await sendInfo(ctx, emptyMsg);
    if (cleanupTarget) scheduleCleanup(cleanupTarget, info, CLEANUP_DELAY);
    return;
  }
  const count = await deleteFetched(msgs);
  const reply = await sendSuccess(ctx, `Successfully deleted ${count} message${count !== 1 ? 's' : ''}.`);
  if (cleanupTarget) scheduleCleanup(cleanupTarget, reply, CLEANUP_DELAY);
}

async function runLinkDelete(
  ctx: any,
  client: LevitateClient,
  links: string[],
  cleanupTarget: any | null,
): Promise<any> {
  let deleted = 0;
  let notFound = 0;

  for (const raw of links) {
    const m = raw.trim().match(MSG_LINK_RE);
    if (!m) { notFound++; continue; }
    const [, gId, cId, mId] = m;
    const guild = client.guilds.cache.get(gId);
    const ch: any =
      guild?.channels?.cache?.get(cId) ??
      (await client.channels.fetch(cId).catch((): null => null));
    if (!guild || !ch || typeof ch.messages?.fetch !== 'function') {
      notFound++; continue;
    }
    const me = guild.members.me;
    const perms = me ? ch.permissionsFor?.(me) : null;
    if (!perms?.has?.('ManageMessages')) { notFound++; continue; }
    const target = await ch.messages.fetch(mId).catch((): null => null);
    if (!target) { notFound++; continue; }
    const ok = await target.delete().then(() => true).catch(() => false);
    if (ok) deleted++; else notFound++;
  }

  if (deleted === 0) {
    const info = await sendInfo(ctx, 'No messages found by the provided links.');
    if (cleanupTarget) scheduleCleanup(cleanupTarget, info, CLEANUP_DELAY);
    return;
  }

  const reply = await sendSuccess(
    ctx,
    `Successfully deleted ${deleted} message${deleted !== 1 ? 's' : ''}.`,
  );
  if (notFound > 0) {
    const info = await sendInfo(
      ctx,
      `${notFound} message${notFound !== 1 ? 's' : ''} not found by the provided link${notFound !== 1 ? 's' : ''}.`,
    );
    setTimeout(async () => { await (info as any)?.delete?.().catch((): null => null); }, CLEANUP_DELAY);
  }
  if (cleanupTarget) scheduleCleanup(cleanupTarget, reply, CLEANUP_DELAY);
}

async function askConfirmationSlash(
  interaction: any,
  description: string,
  onConfirm: () => Promise<void>,
): Promise<void> {
  const confirmId = `purge:confirm:${interaction.id}`;
  const cancelId  = `purge:cancel:${interaction.id}`;

  await interaction.editReply(buildPurgeConfirmPayload(confirmId, cancelId, description));
  const confirmMsg = await interaction.fetchReply().catch((): null => null);
  if (!confirmMsg) return;

  const collector = confirmMsg.createMessageComponentCollector({
    filter: (i: any) => authorOnlyFilter(
        i, interaction.user.id,
        (cid) => cid === confirmId || cid === cancelId,
      ),
    max: 1,
    time: 30_000,
  });

  collector.on('collect', async (i: any) => {
    await i.deferUpdate().catch((): null => null);
    if (i.customId === confirmId) {
      await interaction.deleteReply().catch((): null => null);
      await onConfirm();
    } else {
      await i.editReply(buildPurgeCancelledPayload(confirmId, cancelId, description)).catch((): null => null);
      setTimeout(() => interaction.deleteReply().catch((): null => null), 3000);
    }
  });

  collector.on('end', (_: any, reason: string) => {
    if (reason !== 'time') return;
    confirmMsg.edit(buildPurgeTimedOutPayload(confirmId, cancelId, description)).catch((): null => null);
  });
}

export async function slashExecute(interaction: any, client: LevitateClient): Promise<any> {
  await interaction.deferReply();

  // Fetch the deferred-reply message ID so we can exclude it from any delete
  // operations — otherwise purge amount/all can delete our own reply and then
  // fail with "Unknown Message" when we try to editReply on the gone message.
  const deferredReplyId: string | null = await interaction.fetchReply()
    .then((m: any) => m?.id ?? null)
    .catch((): null => null);

  if (!interaction.guild) {
    return sendError({ interaction }, 'This command can only be used in a server.');
  }

  const botMember = interaction.guild.members.me;
  const perms = botMember ? interaction.channel?.permissionsFor?.(botMember) : null;
  if (!perms?.has?.('ManageMessages')) {
    return sendError({ interaction }, 'I need the **Manage Messages** permission to delete messages.');
  }

  const channel = interaction.channel;
  const subcommand: string = interaction.options.getSubcommand();
  const channelCtx = { channel };

  switch (subcommand) {
    case 'all': {
      return askConfirmationSlash(interaction, 'Delete **all** messages in this channel?', async () => {
        await runFilteredDelete(channelCtx, channel, '', () => true, null, 'No messages to delete.', null);
      });
    }
    case 'amount': {
      const count: number = interaction.options.getInteger('count', true);
      const msgs = await channel.messages.fetch({ limit: Math.min(count, 100) }).catch((): null => null);
      if (!msgs || msgs.size === 0) return sendInfo({ interaction }, 'No messages to delete.');
      // Exclude the deferred reply so we don't delete our own message and then
      // fail to edit it afterwards with "Unknown Message".
      const arr = Array.from(msgs.values()).filter((m: any) => m.id !== deferredReplyId);
      const deleted = await deleteFetched(arr);
      return sendSuccess({ interaction }, `Successfully deleted ${deleted} message${deleted !== 1 ? 's' : ''}.`);
    }
    case 'bot': {
      const maxCount: number | null = interaction.options.getInteger('count') ?? null;
      return askConfirmationSlash(interaction, `Delete **bot** messages${maxCount ? ` (up to ${maxCount})` : ''} in this channel?`, async () => {
        await runFilteredDelete(channelCtx, channel, interaction.id, (m: any) => m.author?.bot === true, maxCount, 'No bot messages found.', null);
      });
    }
    case 'humans': {
      const maxCount: number | null = interaction.options.getInteger('count') ?? null;
      return askConfirmationSlash(interaction, `Delete **human** messages${maxCount ? ` (up to ${maxCount})` : ''} in this channel?`, async () => {
        await runFilteredDelete(channelCtx, channel, interaction.id, (m: any) => !m.author?.bot, maxCount, 'No human messages found.', null);
      });
    }
    case 'user': {
      const targetUser: any = interaction.options.getUser('user', true);
      const maxCount: number | null = interaction.options.getInteger('count') ?? null;
      return askConfirmationSlash(interaction, `Delete messages from **${targetUser.username}**${maxCount ? ` (up to ${maxCount})` : ''} in this channel?`, async () => {
        await runFilteredDelete(channelCtx, channel, interaction.id, (m: any) => m.author?.id === targetUser.id, maxCount, `No messages from **${targetUser.username}** found.`, null);
      });
    }
    case 'text': {
      const termsRaw: string = interaction.options.getString('terms', true);
      const terms = parseTextTerms([termsRaw]);
      if (terms.length === 0) return sendError({ interaction }, 'No valid search terms provided.');
      if (terms.length > 10) return sendError({ interaction }, 'You can provide at most **10** search terms.');
      const filter = (m: any) => terms.some((t: string) => m.content?.toLowerCase().includes(t.toLowerCase()));
      await runFilteredDelete(channelCtx, channel, interaction.id, filter, null, 'No messages matching those terms found.', null);
      return;
    }
    case 'images': {
      const maxCount: number | null = interaction.options.getInteger('count') ?? null;
      return askConfirmationSlash(
        interaction,
        `Delete **image messages**${maxCount ? ` (up to ${maxCount})` : ''} in this channel?`,
        async () => {
          const filter = (m: any) =>
            m.attachments.find((a: any) => a.contentType?.startsWith('image/')) != null;
          await runFilteredDelete(channelCtx, channel, interaction.id, filter, maxCount, 'No image messages found.', null);
        },
      );
    }
    case 'files': {
      const maxCount: number | null = interaction.options.getInteger('count') ?? null;
      return askConfirmationSlash(
        interaction,
        `Delete **messages with attachments**${maxCount ? ` (up to ${maxCount})` : ''} in this channel?`,
        async () => {
          const filter = (m: any) => m.attachments.size > 0;
          await runFilteredDelete(channelCtx, channel, interaction.id, filter, maxCount, 'No messages with attachments found.', null);
        },
      );
    }
    case 'links': {
      const maxCount: number | null = interaction.options.getInteger('count') ?? null;
      return askConfirmationSlash(
        interaction,
        `Delete **messages containing URLs**${maxCount ? ` (up to ${maxCount})` : ''} in this channel?`,
        async () => {
          const filter = (m: any) => /https?:\/\//i.test(m.content);
          await runFilteredDelete(channelCtx, channel, interaction.id, filter, maxCount, 'No messages with URLs found.', null);
        },
      );
    }
    case 'link': {
      const linksRaw: string = interaction.options.getString('links', true);
      const terms = parseTextTerms([linksRaw]);
      if (terms.length === 0) return sendError({ interaction }, 'No valid links provided.');
      if (terms.length > 10) return sendError({ interaction }, 'You can provide at most **10** links.');
      await runLinkDelete(channelCtx, client, terms, null);
      return;
    }
    case 'between': {
      const link1: string = interaction.options.getString('link1', true);
      const link2: string = interaction.options.getString('link2', true);
      const r1 = parseMessageRef(link1, channel.id);
      const r2 = parseMessageRef(link2, channel.id);
      if (!r1 || !r2) return sendError({ interaction }, 'Both arguments must be valid message IDs or Discord message links.');
      if (!r1.sameChannel || !r2.sameChannel) {
        return sendError({ interaction }, 'Both messages must be from this channel.');
      }
      return askConfirmationSlash(
        interaction,
        'Delete **all messages between** the two provided messages (inclusive)?',
        async () => {
          const msgs = await fetchMessagesBetween(channel, r1.id, r2.id);
          if (msgs.length === 0) {
            const info = await sendInfo(channelCtx, 'No messages found between those messages.');
            return;
          }
          const count = await deleteFetched(msgs);
          await sendSuccess(channelCtx, `Successfully deleted ${count} message${count !== 1 ? 's' : ''}.`);
        },
      );
    }
    case 'embeds': {
      const maxCount: number | null = interaction.options.getInteger('count') ?? null;
      return askConfirmationSlash(
        interaction,
        `Delete **messages containing embeds**${maxCount ? ` (up to ${maxCount})` : ''} in this channel?`,
        async () => {
          const filter = (m: any) => m.embeds?.length > 0;
          await runFilteredDelete(channelCtx, channel, interaction.id, filter, maxCount, 'No messages with embeds found.', null);
        },
      );
    }
    case 'reactions': {
      const maxCount: number | null = interaction.options.getInteger('count') ?? null;
      const count = await stripReactions(channel, interaction.id, maxCount);
      if (count === 0) return sendInfo({ interaction }, 'No messages with reactions found.');
      return sendSuccess({ interaction }, `Successfully stripped reactions from ${count} message${count !== 1 ? 's' : ''}.`);
    }
    default:
      return sendError({ interaction }, 'Unknown subcommand.');
  }
}

export async function prefixExecute(message: any, args: string[], client: LevitateClient): Promise<any> {
  const statusCtx = { message, reply: false };

  if (!message.guild) return sendError(statusCtx, 'This command can only be used in a server.');

  // Check manage messages permission
  const member = message.guild.members.me;
  const perms = member ? message.channel.permissionsFor?.(member) : null;
  if (!perms?.has?.('ManageMessages')) {
    return sendError(statusCtx, 'I need the **Manage Messages** permission to delete messages.');
  }
  const authorPerms = message.channel.permissionsFor?.(message.member);
  if (!authorPerms?.has?.('ManageMessages')) {
    return sendError(statusCtx, 'You need the **Manage Messages** permission to use this command.');
  }

  if (args.length === 0) {
    return sendError(statusCtx, `No subcommand provided. Usage:\n\`\`\`\n${options.usage}\n\`\`\``);
  }

  const sub = args[0].toLowerCase();
  const channel = message.channel;
  const cmdId: string = message.id;

  // ── purge all ─────────────────────────────────────────────────────────────
  if (sub === 'all') {
    const desc = 'Are you sure you want to delete **all messages** in this channel?';
    return askConfirmation(message, desc, () =>
      runFilteredDelete(statusCtx, channel, cmdId, () => true, null, 'No messages to delete.', message),
    );
  }

  // ── purge text ────────────────────────────────────────────────────────────
  if (sub === 'text') {
    const rawJoined = args.slice(1).join(' ');
    const rawQuoted = [...rawJoined.matchAll(/"([^"]+)"/g)].map(m => m[1]);
    if (rawQuoted.length > 10) {
      return sendError(statusCtx, `Too many search terms — max **10**, you provided **${rawQuoted.length}**.`);
    }
    const terms = parseTextTerms(args.slice(1));
    if (terms.length === 0) {
      return sendError(statusCtx, 'Provide at least one search term. Example: `purge text "hello"`');
    }
    const quoted = terms.map(t => `"${t}"`).join(', ');
    const desc = `Are you sure you want to delete **all messages containing ${quoted}** in this channel?`;
    const lowerTerms = terms.map(t => t.toLowerCase());
    const filter = (msg: any) => lowerTerms.some(t => msg.content.toLowerCase().includes(t));
    return askConfirmation(message, desc, () =>
      runFilteredDelete(statusCtx, channel, cmdId, filter, null, 'No messages found matching your search terms.', message),
    );
  }

  // ── purge bot ─────────────────────────────────────────────────────────────
  if (sub === 'bot' || sub === 'bots') {
    const maxCount = args[1] && /^\d+$/.test(args[1]) ? parseInt(args[1], 10) : null;
    if (maxCount !== null && maxCount <= 0) return sendError(statusCtx, 'Amount must be a positive number.');
    const desc = maxCount !== null
      ? `Are you sure you want to delete **${maxCount} bot messages** in this channel?`
      : 'Are you sure you want to delete **all bot messages** in this channel?';
    return askConfirmation(message, desc, () =>
      runFilteredDelete(statusCtx, channel, cmdId, (m: any) => m.author.bot, maxCount, 'No bot messages found.', message),
    );
  }

  // ── purge humans ──────────────────────────────────────────────────────────
  if (sub === 'humans') {
    const maxCount = args[1] && /^\d+$/.test(args[1]) ? parseInt(args[1], 10) : null;
    if (maxCount !== null && maxCount <= 0) return sendError(statusCtx, 'Amount must be a positive number.');
    const desc = maxCount !== null
      ? `Are you sure you want to delete **${maxCount} human (non-bot) messages** in this channel?`
      : 'Are you sure you want to delete **all human (non-bot) messages** in this channel?';
    return askConfirmation(message, desc, () =>
      runFilteredDelete(statusCtx, channel, cmdId, (m: any) => !m.author.bot, maxCount, 'No human messages found.', message),
    );
  }

  // ── purge user ────────────────────────────────────────────────────────────
  if (sub === 'user') {
    if (args.length < 2) {
      return sendError(statusCtx, 'Provide a user. Example: `purge user @someone` or `purge user @someone 20`');
    }
    const targetUser = await resolveUser(client, message.guild, args[1]);
    if (!targetUser) return sendError(statusCtx, 'User not found. Try a mention, user ID, or username.');
    const maxCount = args[2] && /^\d+$/.test(args[2]) ? parseInt(args[2], 10) : null;
    if (maxCount !== null && maxCount <= 0) return sendError(statusCtx, 'Amount must be a positive number.');
    const desc = maxCount !== null
      ? `Are you sure you want to delete **${maxCount} messages from ${targetUser.username}** in this channel?`
      : `Are you sure you want to delete **all messages from ${targetUser.username}** in this channel?`;
    const filter = (msg: any) => msg.author.id === targetUser.id;
    return askConfirmation(message, desc, () =>
      runFilteredDelete(statusCtx, channel, cmdId, filter, maxCount, 'No messages found from that user.', message),
    );
  }

  // ── purge amount <n> ──────────────────────────────────────────────────────
  if (sub === 'amount') {
    const raw = args[1];
    if (!raw || !/^\d+$/.test(raw)) return sendError(statusCtx, 'Provide a valid number. Example: `purge amount 10`');
    const n = parseInt(raw, 10);
    if (n <= 0) return sendError(statusCtx, 'Amount must be a positive number.');
    return runFilteredDelete(statusCtx, channel, cmdId, () => true, n, 'No messages to delete.', message);
  }

  // ── purge images ──────────────────────────────────────────────────────────
  if (sub === 'images') {
    const maxCount = args[1] && /^\d+$/.test(args[1]) ? parseInt(args[1], 10) : null;
    if (maxCount !== null && maxCount <= 0) return sendError(statusCtx, 'Amount must be a positive number.');
    const desc = maxCount !== null
      ? `Are you sure you want to delete **${maxCount} image messages** in this channel?`
      : 'Are you sure you want to delete **all messages with images** in this channel?';
    const filter = (m: any) =>
      m.attachments.find((a: any) => a.contentType?.startsWith('image/')) != null;
    return askConfirmation(message, desc, () =>
      runFilteredDelete(statusCtx, channel, cmdId, filter, maxCount, 'No image messages found.', message),
    );
  }

  // ── purge files ────────────────────────────────────────────────────────────
  if (sub === 'files') {
    const maxCount = args[1] && /^\d+$/.test(args[1]) ? parseInt(args[1], 10) : null;
    if (maxCount !== null && maxCount <= 0) return sendError(statusCtx, 'Amount must be a positive number.');
    const desc = maxCount !== null
      ? `Are you sure you want to delete **${maxCount} messages with file attachments** in this channel?`
      : 'Are you sure you want to delete **all messages with file attachments** in this channel?';
    const filter = (m: any) => m.attachments.size > 0;
    return askConfirmation(message, desc, () =>
      runFilteredDelete(statusCtx, channel, cmdId, filter, maxCount, 'No messages with attachments found.', message),
    );
  }

  // ── purge links ────────────────────────────────────────────────────────────
  // Note: "purge links" deletes messages containing HTTP/HTTPS URLs.
  //       "purge link" (singular) deletes specific messages by their Discord message link.
  if (sub === 'links') {
    const maxCount = args[1] && /^\d+$/.test(args[1]) ? parseInt(args[1], 10) : null;
    if (maxCount !== null && maxCount <= 0) return sendError(statusCtx, 'Amount must be a positive number.');
    const desc = maxCount !== null
      ? `Are you sure you want to delete **${maxCount} messages containing URLs** in this channel?`
      : 'Are you sure you want to delete **all messages containing URLs** in this channel?';
    const filter = (m: any) => /https?:\/\//i.test(m.content);
    return askConfirmation(message, desc, () =>
      runFilteredDelete(statusCtx, channel, cmdId, filter, maxCount, 'No messages with URLs found.', message),
    );
  }

  // ── purge link ────────────────────────────────────────────────────────────
  if (sub === 'link') {
    const rest = args.slice(1);
    if (rest.length === 0) {
      return sendError(statusCtx, 'Provide a message link. Example: `purge link <message-link>`');
    }
    const joined = rest.join(' ');
    const quoted = [...joined.matchAll(/"([^"]+)"/g)].map(m => m[1]);
    let links: string[];
    if (quoted.length > 0) {
      if (quoted.length > 10) return sendError(statusCtx, `Too many links — max **10**, you provided **${quoted.length}**.`);
      links = quoted;
    } else {
      if (rest.length > 1) return sendError(statusCtx, 'For multiple links, wrap each in quotes: `purge link "link1" "link2"`');
      links = [rest[0]];
    }
    return runLinkDelete(statusCtx, client, links, message);
  }

  // ── purge between ─────────────────────────────────────────────────────────
  if (sub === 'between') {
    if (!args[1] || !args[2]) {
      return sendError(statusCtx, 'Provide two message IDs or links. Example: `purge between <id-or-link1> <id-or-link2>`');
    }
    const r1 = parseMessageRef(args[1], channel.id);
    const r2 = parseMessageRef(args[2], channel.id);
    if (!r1 || !r2) return sendError(statusCtx, 'Both arguments must be valid message IDs or Discord message links.');
    if (!r1.sameChannel || !r2.sameChannel) {
      return sendError(statusCtx, 'Both messages must be from this channel.');
    }
    const desc = 'Are you sure you want to delete **all messages between** the two provided messages (inclusive)?';
    return askConfirmation(message, desc, async () => {
      const msgs = await fetchMessagesBetween(channel, r1.id, r2.id);
      const filtered = msgs.filter((mm: any) => mm.id !== cmdId);
      if (filtered.length === 0) {
        const info = await sendInfo(statusCtx, 'No messages found between those messages.');
        scheduleCleanup(message, info, CLEANUP_DELAY);
        return;
      }
      const count = await deleteFetched(filtered);
      const reply = await sendSuccess(statusCtx, `Successfully deleted ${count} message${count !== 1 ? 's' : ''}.`);
      scheduleCleanup(message, reply, CLEANUP_DELAY);
    });
  }

  // ── purge embeds ──────────────────────────────────────────────────────────
  if (sub === 'embeds') {
    const maxCount = args[1] && /^\d+$/.test(args[1]) ? parseInt(args[1], 10) : null;
    if (maxCount !== null && maxCount <= 0) return sendError(statusCtx, 'Amount must be a positive number.');
    const desc = maxCount !== null
      ? `Are you sure you want to delete **${maxCount} messages containing embeds** in this channel?`
      : 'Are you sure you want to delete **all messages containing embeds** in this channel?';
    const filter = (m: any) => m.embeds?.length > 0;
    return askConfirmation(message, desc, () =>
      runFilteredDelete(statusCtx, channel, cmdId, filter, maxCount, 'No messages with embeds found.', message),
    );
  }

  // ── purge reactions ───────────────────────────────────────────────────────
  if (sub === 'reactions') {
    const maxCount = args[1] && /^\d+$/.test(args[1]) ? parseInt(args[1], 10) : null;
    if (maxCount !== null && maxCount <= 0) return sendError(statusCtx, 'Amount must be a positive number.');
    const count = await stripReactions(channel, cmdId, maxCount);
    if (count === 0) return sendInfo(statusCtx, 'No messages with reactions found.');
    return sendSuccess(statusCtx, `Successfully stripped reactions from ${count} message${count !== 1 ? 's' : ''}.`);
  }

  // ── purge <n> (shorthand) ─────────────────────────────────────────────────
  if (/^\d+$/.test(sub)) {
    const n = parseInt(sub, 10);
    if (n <= 0) return sendError(statusCtx, 'Amount must be a positive number.');
    return runFilteredDelete(statusCtx, channel, cmdId, () => true, n, 'No messages to delete.', message);
  }

  return sendError(statusCtx, `Unknown subcommand \`${args[0]}\`. Usage:\n\`\`\`\n${options.usage}\n\`\`\``);
}
