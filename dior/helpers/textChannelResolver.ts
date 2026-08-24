// xoxo/helpers/textChannelResolver.ts
//
// Resolves a guild text channel from a mention, ID, or text found in its name.

import { ChannelType } from 'discord.js';

const TEXT_CHANNEL_MENTION = /^<#(\d+)>$/;
const CHANNEL_ID = /^\d{17,20}$/;

export function resolveTextChannel(guild: any, input: string): any | null {
  const value = input.trim();
  if (!value) return null;

  const mention = value.match(TEXT_CHANNEL_MENTION);
  const channelId = mention?.[1] ?? (CHANNEL_ID.test(value) ? value : null);
  if (channelId) {
    const channel = guild.channels?.cache?.get(channelId);
    return channel?.type === ChannelType.GuildText || channel?.type === ChannelType.GuildAnnouncement
      ? channel
      : null;
  }

  const query = value.toLocaleLowerCase();
  return [...(guild.channels?.cache?.values?.() ?? [])]
    .filter((channel: any) =>
      (channel.type === ChannelType.GuildText || channel.type === ChannelType.GuildAnnouncement) &&
      channel.name?.toLocaleLowerCase().includes(query),
    )
    .sort((a: any, b: any) => a.rawPosition - b.rawPosition || a.id.localeCompare(b.id))[0] ?? null;
}