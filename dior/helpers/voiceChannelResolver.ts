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
  return [...(guild.channels?.cache?.values?.() ?? [])]
    .filter((channel: any) =>
      channel.type === ChannelType.GuildVoice &&
      channel.name?.toLocaleLowerCase() === name,
    )
    .sort((a: any, b: any) => a.rawPosition - b.rawPosition)[0] ?? null;
}
