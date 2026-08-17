import {
  ContainerBuilder,
  MessageFlags,
  SectionBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  TextDisplayBuilder,
  ThumbnailBuilder,
} from 'discord.js';
import type { LevitateClient } from '../structures/LevitateClient.js';
import { emojis } from '../emojis.js';

const mediaChannelCache = new Map<string, { channelIds: Set<string>; expiresAt: number }>();
const CACHE_TTL_MS = 15_000;

function cacheKey(guildId: string): string {
  return guildId;
}

export function invalidateMediaChannelCache(guildId: string): void {
  mediaChannelCache.delete(cacheKey(guildId));
}

export async function getMediaChannelIds(
  client: LevitateClient,
  guildId: string,
): Promise<string[]> {
  const cached = mediaChannelCache.get(cacheKey(guildId));
  if (cached && cached.expiresAt > Date.now()) return [...cached.channelIds];

  const ids = await client.db?.getMediaChannels(guildId).catch((): string[] => []) ?? [];
  mediaChannelCache.set(cacheKey(guildId), {
    channelIds: new Set(ids),
    expiresAt: Date.now() + CACHE_TTL_MS,
  });
  return ids;
}

export async function enforceMediaChannel(message: any, client: LevitateClient): Promise<boolean> {
  if (!message.guild || !client.db) return false;

  const channelIds = await getMediaChannelIds(client, message.guild.id);
  if (!channelIds.includes(message.channelId ?? message.channel?.id)) return false;

  // Captions are allowed; messages without any uploaded file are not.
  if ((message.attachments?.size ?? 0) > 0) return false;

  await message.delete().catch((): null => null);
  return true;
}

export function buildMediaChannelsPayload(guild: any, channelIds: string[]): any {
  const lines = channelIds.length
    ? channelIds.map((id) => `${emojis.whiteArrow} <#${id}> (\`${id}\`)`)
    : ['No media channels are configured.'];

  const body = [
    'The following channels are restricted to **media only**. Any text messages **without attachments** will be automatically removed.',
    ...lines,
  ].join('\n');

  const container = new ContainerBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`## ${emojis.aestheticCam} Media Channel(s)`),
    )
    .addSeparatorComponents(
      new SeparatorBuilder({ spacing: SeparatorSpacingSize.Small, divider: true }),
    );

  const iconUrl = guild.iconURL?.({ forceStatic: false, size: 128 }) ?? null;
  if (iconUrl) {
    container.addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(body))
        .setThumbnailAccessory(new ThumbnailBuilder().setURL(iconUrl)),
    );
  } else {
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(body));
  }

  if (channelIds.length >= 4) {
    container.addSeparatorComponents(
      new SeparatorBuilder({ spacing: SeparatorSpacingSize.Small, divider: true }),
    );
  }

  return {
    components: [container],
    flags: MessageFlags.IsComponentsV2,
    allowedMentions: { parse: [] },
  };
}