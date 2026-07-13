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
  category:    'utility',
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
    const content = msg.content?.trim() || (msg.attachments?.size > 0 ? '[attachment]' : '[no content]');
    return `[${ts}] ${msg.author?.username ?? 'Unknown'}: ${content}`;
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
