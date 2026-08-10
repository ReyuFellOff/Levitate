import { PermissionFlagsBits } from 'discord.js';

const SNOWFLAKE = /^\d{17,20}$/;
const MESSAGE_LINK = /^https?:\/\/(?:www\.)?(?:(?:canary|ptb)\.)?discord(?:app)?\.com\/channels\/(\d{17,20})\/(\d{17,20})\/(\d{17,20})(?:[/?#].*)?$/i;

export interface MessageTarget {
  message: any;
  channel: any;
}

export interface MessageTargetFailure {
  error: string;
}

export type MessageTargetResult = MessageTarget | MessageTargetFailure;

function parseReference(
  input: string,
  currentChannelId: string,
): { guildId?: string; channelId: string; messageId: string } | null {
  const value = input.trim().replace(/^<(.+)>$/, '$1');
  if (SNOWFLAKE.test(value)) {
    return { channelId: currentChannelId, messageId: value };
  }

  const link = value.match(MESSAGE_LINK);
  if (!link) return null;

  return {
    guildId:   link[1],
    channelId: link[2],
    messageId: link[3],
  };
}

/**
 * Resolve a message ID/link, or the message being replied to when no explicit
 * reference was supplied. Bare IDs intentionally stay scoped to the current
 * channel; only a full Discord link can select another channel.
 */
export async function resolveMessageTarget(
  guild: any,
  currentChannel: any,
  input: string | undefined,
  replyReference?: { channelId?: string; messageId?: string },
): Promise<MessageTargetResult> {
  const reference: {
    guildId?: string;
    channelId: string;
    messageId: string;
  } | null = input?.trim()
    ? parseReference(input, currentChannel?.id)
    : replyReference?.messageId
      ? {
          guildId:   undefined,
          channelId: replyReference.channelId ?? currentChannel?.id,
          messageId: replyReference.messageId,
        }
      : null;

  if (!reference?.channelId || !reference.messageId) {
    return {
      error: 'Reply to a message or provide its message ID or Discord message link.',
    };
  }

  if (reference.guildId && reference.guildId !== guild.id) {
    return { error: 'That message belongs to a different server.' };
  }

  const channel = reference.channelId === currentChannel?.id
    ? currentChannel
    : await guild.channels.fetch(reference.channelId).catch((): null => null);

  if (!channel?.messages?.fetch) {
    return {
      error: 'I cannot access the channel containing that message.',
    };
  }

  const message = await channel.messages.fetch(reference.messageId).catch((): null => null);
  if (!message) {
    return {
      error: 'I could not find that message, or I do not have access to it.',
    };
  }

  return { message, channel };
}

export function canManageMessages(channel: any, member: any): boolean {
  return !!channel?.permissionsFor?.(member)?.has?.(PermissionFlagsBits.ManageMessages);
}