import { PermissionFlagsBits } from 'discord.js';
import type { LevitateClient } from '../../structures/LevitateClient.js';
import { sendError } from '../../components/statusMessages.js';
import { resolveEmoji } from '../../helpers/emojiResolver.js';

export const options = {
  name: 'sayemoji',
  aliases: ['em'] as string[],
  description: 'Send one or more emojis as a message.',
  usage: `sayemoji <name or ID>
  sayemoji <name1>|$|<name2>
  sayemoji <name1> <name2>`,
  category: 'utility',
  owner: false,
  cooldown: 2,
};

const NO_SPACE_SEP = '|$|';

function parseInput(input: string): string[][] {
  return input.split(/\s+/).map((token) => token.split(NO_SPACE_SEP));
}

export async function prefixExecute(message: any, args: string[], client: LevitateClient) {
  const invokerPerms = message.channel.permissionsFor?.(message.member);
  const hasManageMessages = invokerPerms?.has?.(PermissionFlagsBits.ManageMessages);
  const hasAdmin = invokerPerms?.has?.(PermissionFlagsBits.Administrator);
  if (!hasManageMessages && !hasAdmin) {
    return sendError(
      { message },
      'You need **Manage Messages** or **Administrator** permission to use this command.',
    );
  }

  const input = args.join(' ').trim();
  if (!input) return sendError({ message }, 'Please provide emoji identifiers.');

  const groups = parseInput(input);
  const resolvedGroups: string[] = [];
  const invalid: string[] = [];

  for (const group of groups) {
    const resolvedParts: string[] = [];
    for (const identifier of group) {
      if (!identifier) continue;
      const emoji = await resolveEmoji(client, identifier, message.guild);
      if (emoji) {
        resolvedParts.push(emoji.toString());
      } else {
        invalid.push(identifier);
      }
    }
    if (resolvedParts.length) resolvedGroups.push(resolvedParts.join(''));
  }

  const finalString = resolvedGroups.join(' ').trim();
  if (!finalString && invalid.length) {
    return sendError({ message }, 'All provided emoji identifiers were invalid!');
  }

  await message.delete().catch(() => {});

  if (finalString) {
    if (message.reference?.messageId) {
      const replied = await message.channel.messages
        .fetch(message.reference.messageId)
        .catch((): null => null);
      if (replied) {
        await replied.reply(finalString).catch(() => message.channel.send(finalString));
      } else {
        await message.channel.send(finalString);
      }
    } else {
      await message.channel.send(finalString);
    }
  }

  if (invalid.length) {
    const errorMessage = await sendError(
      { channel: message.channel },
      `Some emoji identifiers were invalid:\n${invalid.map((identifier) => `• \`${identifier}\``).join('\n')}`,
    );
    if (errorMessage) setTimeout(() => (errorMessage as any).delete().catch(() => {}), 6000);
  }
}