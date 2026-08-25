// xoxo/commands/developer/say.ts
//
// Make the bot say something.
// Available to anyone with Manage Messages or Administrator permission.
//
// Supports:
//   • \n → real newline
//   • $emoji<name_or_id>  → resolves to the actual Discord emoji
//   • $emojyname1|$|$emojyname2  → two emojis joined with no space
//   • Direct emoji characters (passthrough)
//   • File/image attachments
//   • If used as a reply, the bot also replies to that message

import { AttachmentBuilder, PermissionFlagsBits } from 'discord.js';
import type { CassieClient } from '../../structures/CassieClient.js';
import { sendError, sendSuccess } from '../../components/statusMessages.js';
import { resolveEmoji } from '../../helpers/emojiResolver.js';
import { parseSayText } from '../../helpers/emojiParser.js';

export const options = {
  name: 'say',
  aliases: ['echo'] as string[],
  description: 'Make the bot say something. Requires Manage Messages or Administrator.',
  usage: `say <text>
  say Hello\\nworld
  say $emoji<name_or_id>
  say $emojyname1|$|$emojyname2`,
  category: 'utility',
  owner: false,
  cooldown: 0,
};

// ─── Prefix execute ──────────────────────────────────────────────────────────

export async function prefixExecute(message: any, args: string[], client: CassieClient) {
  // Permission check: Manage Messages or Administrator
  const invokerPerms = message.channel.permissionsFor?.(message.member);
  const hasManageMessages = invokerPerms?.has?.(PermissionFlagsBits.ManageMessages);
  const hasAdmin           = invokerPerms?.has?.(PermissionFlagsBits.Administrator);
  if (!hasManageMessages && !hasAdmin) {
    return sendError(
      { message },
      'You need **Manage Messages** or **Administrator** permission to use this command.',
    );
  }

  const rawText: string =
    typeof message.commandRawArgs === 'string' ? message.commandRawArgs : args.join(' ');
  if (!rawText && !message.attachments.size) {
    return sendError({ message }, 'Please provide text to say or attach a file!');
  }

  let processed = rawText
    .replace(/\\\\n/g, '\u0000')
    .replace(/\\n/g, '\n')
    .replace(/\u0000/g, '\\n');

  const { text: finalText, invalid } = await parseSayText(processed, (id) =>
    resolveEmoji(client, id, message.guild),
  );

  let files: AttachmentBuilder[] = [];
  if (message.attachments.size) {
    files = await Promise.all(
      message.attachments.map(async (attachment: any) => {
        const response = await fetch(attachment.url);
        const buffer = Buffer.from(await response.arrayBuffer());
        return new AttachmentBuilder(buffer, { name: attachment.name });
      }),
    );
  }

  await message.delete().catch(() => {});

  const sendOptions: any = {
    content: finalText || null,
    files: files.length ? files : undefined,
  };

  if (message.reference?.messageId) {
    const replied = await message.channel.messages
      .fetch(message.reference.messageId)
      .catch((): null => null);
    if (replied) {
      await replied.reply(sendOptions).catch(() => message.channel.send(sendOptions));
    } else {
      await message.channel.send(sendOptions);
    }
  } else {
    await message.channel.send(sendOptions);
  }

  if (invalid.length) {
    const errMsg = await sendError(
      { channel: message.channel },
      `Some emoji identifiers were invalid:\n${invalid.map((id) => `• \`${id}\``).join('\n')}`,
    );
    if (errMsg) setTimeout(() => (errMsg as any).delete().catch(() => {}), 6000);
  }
}

// ─── Slash execute ───────────────────────────────────────────────────────────

export async function slashExecute(interaction: any, client: CassieClient) {
  // Permission check: Manage Messages or Administrator
  const memberPerms = interaction.member?.permissions;
  const hasManageMessages = memberPerms?.has?.(PermissionFlagsBits.ManageMessages);
  const hasAdmin           = memberPerms?.has?.(PermissionFlagsBits.Administrator);
  if (!hasManageMessages && !hasAdmin) {
    return sendError(
      { interaction },
      'You need **Manage Messages** or **Administrator** permission to use this command.',
    );
  }

  await interaction.deferReply();

  const rawText: string = interaction.options.getString('text') ?? '';
  const attachment: any = interaction.options.getAttachment('attachment') ?? null;

  if (!rawText && !attachment) {
    return sendError({ interaction }, 'Please provide text to say or attach a file!');
  }

  const withNewlines = rawText.replace(/\\n/g, '\n');

  const { text: finalText, invalid } = await parseSayText(withNewlines, (id) =>
    resolveEmoji(client, id, interaction.guild),
  );

  if (invalid.length) {
    return sendError(
      { interaction },
      `Invalid emoji identifiers:\n${invalid.map((id) => `• \`${id}\``).join('\n')}`,
    );
  }

  let files: AttachmentBuilder[] = [];
  if (attachment) {
    const response = await fetch(attachment.url);
    const buffer = Buffer.from(await response.arrayBuffer());
    files.push(new AttachmentBuilder(buffer, { name: attachment.name }));
  }

  await interaction.channel.send({
    content: finalText || null,
    files: files.length ? files : undefined,
  });

  const successMsg = await sendSuccess({ interaction }, 'Message sent.');
  if (successMsg) setTimeout(() => (successMsg as any).delete().catch(() => {}), 5000);
}
