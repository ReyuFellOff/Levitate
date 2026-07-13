// xoxo/commands/welcomer/greet-message.ts
//
// $greet-message — set or remove the welcome message text for this server.
//
// Usage:
//   $greet-message set <text> [data: <saved-data-name>]
//   $greet-message remove
//
// Placeholders like ${user_mention}, ${server_name}, ${server_member_count}
// are resolved at send time. Run $placeholders for the full list.
//
// The optional [data: <name>] suffix attaches a saved embed or CV2 block
// to the message. Example:
//   $greet-message set Welcome, ${user_mention}! [data: welcome card]

import { PermissionFlagsBits } from 'discord.js';
import type { LevitateClient } from '../../structures/LevitateClient.js';
import { sendError, sendSuccess } from '../../components/statusMessages.js';
import { parseSayText } from '../../helpers/emojiParser.js';
import { resolveEmoji } from '../../helpers/emojiResolver.js';

export const options = {
  name:        'greet-message',
  aliases:     ['gm', 'greet-msg'] as string[],
  description: 'Set or remove the welcome message text. Supports placeholders and saved data.',
  usage: `greet-message set <text> [data: <saved-data-name>]
greet-message remove`,
  category: 'welcomer',
  owner:    false,
  cooldown: 3,
};

const MESSAGE_LIMIT = 1500;

function parseMessageInput(raw: string): { text: string | null; dataName: string | null } {
  const match = raw.match(/^([\s\S]*?)\s*\[data:\s*([^\]]+)\]\s*$/i);
  if (match) {
    return {
      text:     match[1].trim() || null,
      dataName: match[2].trim() || null,
    };
  }
  return { text: raw.trim() || null, dataName: null };
}

export async function prefixExecute(
  message: any,
  args:    string[],
  client:  LevitateClient,
): Promise<any> {
  const ctx    = { message };
  const prefix = client.config.prefix;
  if (!message.guild) return sendError(ctx, 'This command can only be used in a server.');

  if (!message.channel.permissionsFor?.(message.member)?.has?.(PermissionFlagsBits.ManageGuild))
    return sendError(ctx, 'You need the **Manage Server** permission to use this command.');

  if (!client.db) return sendError(ctx, 'Database is unavailable.');

  const action = args[0]?.toLowerCase();

  if (action === 'set') {
    const raw = args.slice(1).join(' ');
    if (!raw.trim()) {
      return sendError(
        ctx,
        `Provide the message text after \`set\`.\n-# Example: \`${prefix}greet-message set Welcome, \${user_mention}!\`\n-# Append \`[data: <name>]\` to also send a saved embed or CV2.`,
      );
    }

    const { text, dataName } = parseMessageInput(raw);

    if (!text && !dataName)
      return sendError(ctx, 'Could not parse the message. Make sure you have some text or a `[data: <name>]` tag.');

    if (text && text.length > MESSAGE_LIMIT)
      return sendError(ctx, `Message text is too long (**${text.length}** chars). Maximum is **${MESSAGE_LIMIT}** characters.`);

    let parsedText = text;
    if (parsedText) {
      const { text: resolvedText, invalid } = await parseSayText(
        parsedText,
        (id) => resolveEmoji(client, id, message.guild),
      );
      if (invalid.length) {
        return sendError(ctx, `Could not resolve emoji: ${invalid.map((i) => `\`${i}\``).join(', ')}`);
      }
      parsedText = resolvedText;
    }

    if (dataName) {
      const exists = await client.db.savedDataNameExists(message.guild.id, dataName).catch((): boolean => false);
      if (!exists) {
        return sendError(
          ctx,
          `No saved data named \`${dataName}\` found in this server.\n-# Check spelling, or run \`${prefix}view-data\` to list saved entries.`,
        );
      }
    }

    await client.db.setGreetMessage(message.guild.id, parsedText ?? null, dataName ?? null);

    const parts: string[] = [];
    if (parsedText) parts.push(`text: \`${parsedText.slice(0, 60)}${parsedText.length > 60 ? '…' : ''}\``);
    if (dataName)   parts.push(`saved data: \`${dataName}\``);

    return sendSuccess(ctx, `Greet message set — ${parts.join(' + ')}.`);
  }

  if (action === 'remove') {
    await client.db.setGreetMessage(message.guild.id, null, null);
    return sendSuccess(ctx, 'Greet message cleared.');
  }

  return sendError(
    ctx,
    `**Usage:**\n\`${prefix}greet-message set <text> [data: <name>]\`\n\`${prefix}greet-message remove\``,
  );
}
