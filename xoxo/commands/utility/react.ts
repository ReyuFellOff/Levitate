// xoxo/commands/utility/react.ts
//
// React to a message with a custom emoji.
//
// Prefix: reacts to the replied-to message, or the previous message if no reply.
// After reacting, deletes the command message (1 s delay) and sends a brief
// success note that auto-deletes after 5 s.

import type { LevitateClient } from '../../structures/LevitateClient.js';
import { sendError, sendSuccess } from '../../components/statusMessages.js';
import { resolveEmoji } from '../../helpers/emojiResolver.js';

export const options = {
  name: 'react',
  aliases: ['re'] as string[],
  description: 'React to a message with an emoji.',
  usage: `react <emoji name or ID>     (reply to the target message)
  react <emoji name or ID>     (uses the previous message if no reply)`,
  category: 'utility',
  owner: false,
  cooldown: 2,
};

export async function slashExecute(interaction: any, client: LevitateClient): Promise<any> {
  await interaction.deferReply();

  const messageId: string = interaction.options.getString('message_id', true).trim();
  const emojiIdent: string = interaction.options.getString('emoji', true).trim();

  let targetMessage: any;
  try {
    targetMessage = await interaction.channel.messages.fetch(messageId);
  } catch {
    return sendError({ interaction }, 'Could not fetch that message. Make sure the ID is correct.');
  }

  const emoji = await resolveEmoji(client, emojiIdent, interaction.guild);
  if (!emoji) {
    return sendError({ interaction }, 'Emoji not found! Make sure the bot is in a server that has that emoji.');
  }

  try {
    await targetMessage.react(emoji);
    return sendSuccess({ interaction }, 'Reacted to the message.');
  } catch (err: any) {
    console.error('[REACT]', err.message);
    if (err.code === 10014) return sendError({ interaction }, 'Emoji not found! The bot may not have access to this emoji.');
    if (err.code === 50001 || err.code === 50013) return sendError({ interaction }, 'I do not have permission to add reactions in this channel.');
    return sendError({ interaction }, `Failed to react: ${err.message}`);
  }
}

export async function prefixExecute(message: any, args: string[], client: LevitateClient): Promise<any> {
  if (!args.length) {
    return sendError({ message }, 'Please provide an emoji name or ID to react with.');
  }

  const identifier = args.join(' ').trim();
  const emoji = await resolveEmoji(client, identifier, message.guild);
  if (!emoji) {
    return sendError({ message }, 'Emoji not found! Make sure the bot is in a server that has that emoji.');
  }

  // Determine target message
  let targetMessage: any;

  if (message.reference?.messageId) {
    targetMessage = await message.channel.messages
      .fetch(message.reference.messageId)
      .catch((): null => null);
    if (!targetMessage) {
      return sendError({ message }, 'Could not fetch the replied message!');
    }
  } else {
    const recent = await message.channel.messages.fetch({ limit: 2 }).catch((): null => null);
    if (!recent) return sendError({ message }, 'Could not fetch messages in this channel!');
    const arr = Array.from(recent.values()) as any[];
    targetMessage = arr[1] ?? null;
    if (!targetMessage) return sendError({ message }, 'No message found to react to!');
  }

  try {
    await targetMessage.react(emoji);
    setTimeout(() => message.delete().catch(() => {}), 1000);
    const successMsg = await sendSuccess({ channel: message.channel }, 'Reacted!');
    if (successMsg) setTimeout(() => (successMsg as any).delete().catch(() => {}), 5000);
  } catch (err: any) {
    console.error('[REACT]', err.message);
    if (err.code === 10014) {
      return sendError({ message }, 'Emoji not found! The bot may not have access to this emoji.');
    }
    if (err.code === 50001 || err.code === 50013) {
      return sendError({ message }, 'I do not have permission to add reactions in this channel.');
    }
    return sendError({ message }, `Failed to react: ${err.message}`);
  }
}
