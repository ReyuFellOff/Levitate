// xoxo/commands/utility/archive.ts
//
// Save the last N messages of a channel to a .txt file and DM it to the
// invoker (not posted in-channel, to avoid flooding).
//
// Prefix:  $archive [count]
// Slash:   /archive count:[number]

import { AttachmentBuilder, PermissionFlagsBits } from 'discord.js';
import type { LevitateClient } from '../../structures/LevitateClient.js';
import { sendError, sendSuccess } from '../../components/statusMessages.js';

export const options = {
  name:        'archive',
  aliases:     [] as string[],
  description: 'Save recent channel messages to a file and DM it to you.',
  usage:       'archive [count]',
  category:    'miscellaneous',
  owner:       false,
  cooldown:    10,
};

const DEFAULT_COUNT = 100;
const MAX_COUNT = 500;

async function buildArchiveText(channel: any, count: number): Promise<string> {
  const collected: any[] = [];
  let lastId: string | undefined;

  while (collected.length < count) {
    const opts: any = { limit: Math.min(100, count - collected.length) };
    if (lastId) opts.before = lastId;

    const batch = await channel.messages.fetch(opts).catch((): null => null);
    if (!batch || batch.size === 0) break;

    for (const [, msg] of batch) collected.push(msg);

    lastId = batch.last()?.id;
    if (!lastId || batch.size < 100) break;
  }

  const ordered = collected.reverse();
  const lines = ordered.map((msg: any) => {
    const ts = new Date(msg.createdTimestamp).toISOString();
    const author = msg.author?.username ?? 'Unknown';

    // Build a human-readable description of non-text content present in the message.
    const parts: string[] = [];
    const text = msg.content?.trim() ?? '';
    if (text) parts.push(text);
    if (msg.attachments?.size > 0) {
      const count = msg.attachments.size;
      parts.push(count === 1 ? '[attachment]' : `[${count} attachments]`);
    }
    if (msg.stickers?.size > 0) {
      const names = [...msg.stickers.values()].map((s: any) => s.name).filter(Boolean);
      parts.push(names.length ? `[sticker: ${names.join(', ')}]` : '[sticker]');
    }
    if (msg.poll) {
      const question = msg.poll.question?.text?.trim();
      parts.push(question ? `[poll: ${question}]` : '[poll]');
    }
    // Components V2 (IsComponentsV2 flag set) or classic components (buttons, selects, etc.)
    const hasComponents = (msg.components?.length ?? 0) > 0;
    const isCV2 = hasComponents && (msg.flags?.has?.(32768) || msg.flags?.bitfield === 32768 || ((msg.flags?.bitfield ?? 0) & 32768) !== 0);
    if (isCV2) parts.push('[components v2 message]');
    else if (hasComponents) parts.push('[interactive message]');
    // Classic embeds (always present as an array on the message object)
    if ((msg.embeds?.length ?? 0) > 0) {
      const embed = msg.embeds[0];
      const title = embed?.title?.trim() || embed?.author?.name?.trim() || embed?.description?.trim()?.slice(0, 60);
      parts.push(title ? `[embed: ${title}]` : '[embed]');
    }
    // System/activity messages (join, boost, pinned, etc.)
    if (!parts.length && msg.system) parts.push('[system message]');
    // Forward
    if (!parts.length && msg.messageSnapshots?.size > 0) parts.push('[forwarded message]');

    const content = parts.length ? parts.join(' ') : '[no content]';
    return `[${ts}] ${author}: ${content}`;
  });

  return lines.join('\n') || 'No messages found.';
}

async function runArchive(
  ctx:       { message?: any; interaction?: any },
  channel:   any,
  requester: any,
  count:     number,
): Promise<any> {
  const text = await buildArchiveText(channel, count);
  const buffer = Buffer.from(text, 'utf-8');
  const filename = `archive-${channel.id}-${Date.now()}.txt`;
  const attachment = new AttachmentBuilder(buffer, { name: filename });

  try {
    const dm = await requester.createDM();
    await dm.send({
      content: `Archive of <#${channel.id}> — last ${count} message(s) requested.`,
      files:   [attachment],
    });
  } catch {
    return sendError(ctx, 'I could not DM you the archive. Please enable DMs from server members and try again.');
  }

  return sendSuccess(ctx, `Archived up to **${count}** message(s) from <#${channel.id}> and sent it to your DMs.`);
}

export async function prefixExecute(
  message: any,
  args:    string[],
  _client: LevitateClient,
): Promise<any> {
  const ctx = { message };
  if (!message.guild) return sendError(ctx, 'This command can only be used in a server.');

  const invokerPerms = message.channel.permissionsFor?.(message.member);
  if (!invokerPerms?.has?.(PermissionFlagsBits.ManageMessages))
    return sendError(ctx, 'You need the **Manage Messages** permission to use this command.');

  let count = DEFAULT_COUNT;
  if (args[0]) {
    if (!/^\d+$/.test(args[0])) return sendError(ctx, 'Provide a valid number of messages to archive.');
    count = parseInt(args[0], 10);
  }
  if (count <= 0) return sendError(ctx, 'Amount must be a positive number.');
  if (count > MAX_COUNT) return sendError(ctx, `Amount cannot exceed **${MAX_COUNT}**.`);

  return runArchive(ctx, message.channel, message.author, count);
}

export async function slashExecute(
  interaction: any,
  _client:     LevitateClient,
): Promise<any> {
  await interaction.deferReply();
  const ctx = { interaction };
  if (!interaction.guild) return sendError(ctx, 'This command can only be used in a server.');

  const invokerMember = interaction.member;
  if (!invokerMember?.permissions?.has?.(PermissionFlagsBits.ManageMessages))
    return sendError(ctx, 'You need the **Manage Messages** permission to use this command.');

  const count = interaction.options.getInteger('count') ?? DEFAULT_COUNT;
  if (count <= 0) return sendError(ctx, 'Amount must be a positive number.');
  if (count > MAX_COUNT) return sendError(ctx, `Amount cannot exceed **${MAX_COUNT}**.`);

  return runArchive(ctx, interaction.channel, interaction.user, count);
}
