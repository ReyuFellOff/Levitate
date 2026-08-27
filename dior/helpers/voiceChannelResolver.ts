// xoxo/helpers/voiceChannelResolver.ts
//
// Resolves a regular guild voice channel from a mention, ID, or name.

import { ChannelType } from 'discord.js';

const VOICE_CHANNEL_MENTION = /^<#(\d+)>$/;
const CHANNEL_ID = /^\d{17,20}$/;

export function resolveVoiceChannel(guild: any, input: string): any | null {
  const value = input.trim();
  if (!value) return null;

  const mention = value.match(VOICE_CHANNEL_MENTION);
  const channelId = mention?.[1] ?? (CHANNEL_ID.test(value) ? value : null);
  if (channelId) {
    const channel = guild.channels?.cache?.get(channelId);
    return channel?.type === ChannelType.GuildVoice ? channel : null;
  }

  const name = value.toLocaleLowerCase();
  const voiceChannels = [...(guild.channels?.cache?.values?.() ?? [])]
    .filter((channel: any) => channel.type === ChannelType.GuildVoice);
  const exactMatch = voiceChannels.filter((channel: any) =>
    channel.name?.toLocaleLowerCase() === name,
  );
  const matches = exactMatch.length > 0
    ? exactMatch
    : voiceChannels.filter((channel: any) => channel.name?.toLocaleLowerCase().includes(name));

  return matches.sort((a: any, b: any) => a.rawPosition - b.rawPosition || a.id.localeCompare(b.id))[0] ?? null;
}
