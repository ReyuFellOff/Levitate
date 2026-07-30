// xoxo/components/music/nowPlaying.ts
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  MessageFlags,
  SeparatorBuilder,
  TextDisplayBuilder,
  type Message,
  type ChatInputCommandInteraction,
  type TextBasedChannel,
} from 'discord.js';
import { emojis } from '../../emojis.js';

interface NowPlayingContext {
  interaction?: ChatInputCommandInteraction;
  message?: Message;
  channel?: TextBasedChannel;
}

export interface NowPlayingTrackInfo {
  title: string;
  artist: string;
  url?: string;
  sourceName?: string;
  durationFormatted: string;
  currentFormatted: string;
  progress: number;
  thumbnailUrl?: string;
  volume?: number;
  isServerVolume?: boolean;
  requestedBy?: string;
}

export interface NowPlayingOptions {
  allDisabled?: boolean;
  isPeek?: boolean;
  prefix?: string;
}

function getSourceEmoji(sourceName?: string): string {
  switch (sourceName?.toLowerCase()) {
    case 'youtube':      return emojis.youtube;
    case 'youtubemusic': return emojis.youtubeMusic;
    case 'spotify':      return emojis.spotify;
    case 'deezer':       return emojis.deezer;
    case 'applemusic':   return emojis.appleMusic;
    case 'soundcloud':   return emojis.soundcloud;
    default:             return emojis.music;
  }
}

function parseEmoji(emojiStr: string): { id: string; name: string; animated: boolean } | string {
  const match = emojiStr.trim().match(/^<(a?):([^:]+):(\d+)>$/);
  if (match) return { animated: match[1] === 'a', name: match[2]!, id: match[3]! };
  return emojiStr.trim();
}

export function buildNowPlayingPayload(
  player: any,
  track: NowPlayingTrackInfo,
  options?: NowPlayingOptions,
): any {
  const isPeek      = options?.isPeek ?? false;
  const allDisabled = options?.allDisabled ?? isPeek;
  const titleDisplay = track.url ? `[${track.title}](${track.url})` : track.title;
  const volume       = track.volume ?? player.volume ?? 100;
  const sourceEmoji  = getSourceEmoji(track.sourceName);

  const loopStyle = !allDisabled && player.loop && player.loop !== 'none'
    ? ButtonStyle.Primary : ButtonStyle.Secondary;
  const isAutoplay = player.data?.get('isAutoplay') ?? false;
  const autoStyle  = !allDisabled && isAutoplay ? ButtonStyle.Primary : ButtonStyle.Secondary;

  const requestedLine   = track.requestedBy ? `\n**Requester:** ${track.requestedBy}` : '';
  const serverVolSuffix = track.isServerVolume ? ' (Server volume)' : '';

  const trackDetails = isPeek
    ? `**by ${track.artist}**${requestedLine}`
    : `**by ${track.artist}**\n**Volume:** ${volume}%${serverVolSuffix}\n**Seek:** ${track.currentFormatted} / ${track.durationFormatted}${requestedLine}`;

  const footerText = isPeek
    ? '-# This is just a peek of the song.'
    : options?.prefix
      ? `-# Use ${options.prefix}help to see all commands.`
      : '-# Use /help to see all commands.';

  const headerText = isPeek
    ? `${emojis.musicHeartNote} Peeking...`
    : `${sourceEmoji} Now playing`;

  const mainContainer = new ContainerBuilder()
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(headerText))
    .addSeparatorComponents(new SeparatorBuilder());

  if (track.thumbnailUrl) {
    mainContainer.addMediaGalleryComponents(
      new MediaGalleryBuilder().addItems(
        new MediaGalleryItemBuilder().setURL(track.thumbnailUrl),
      ),
    );
  }

  const previousCount = player.queue?.previous?.length ?? 0;
  const queueLength   = player.queue?.length ?? 0;

  mainContainer
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(`## ${titleDisplay}`))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(trackDetails))
    .addSeparatorComponents(new SeparatorBuilder())
    .addActionRowComponents(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setEmoji(parseEmoji(emojis.previous) as any)
          .setStyle(ButtonStyle.Secondary)
          .setCustomId('player:previous')
          .setDisabled(allDisabled || previousCount === 0),
        new ButtonBuilder()
          .setEmoji(parseEmoji(player.paused ? emojis.play : emojis.pause) as any)
          .setStyle(ButtonStyle.Secondary)
          .setCustomId('player:pause')
          .setDisabled(allDisabled),
        new ButtonBuilder()
          .setEmoji(parseEmoji(emojis.stop) as any)
          .setStyle(ButtonStyle.Danger)
          .setCustomId('player:stop')
          .setDisabled(allDisabled),
        new ButtonBuilder()
          .setEmoji(parseEmoji(emojis.skip) as any)
          .setStyle(ButtonStyle.Secondary)
          .setCustomId('player:skip')
          .setDisabled(allDisabled || queueLength === 0),
      ),
    )
    .addActionRowComponents(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setEmoji(parseEmoji(emojis.volumeDown) as any)
          .setStyle(ButtonStyle.Secondary)
          .setCustomId('player:volDown')
          .setDisabled(allDisabled || volume <= 0),
        new ButtonBuilder()
          .setEmoji(parseEmoji(emojis.loop) as any)
          .setStyle(loopStyle)
          .setCustomId('player:loop')
          .setDisabled(allDisabled),
        new ButtonBuilder()
          .setEmoji(parseEmoji(emojis.autoplay) as any)
          .setStyle(autoStyle)
          .setCustomId('player:autoplay')
          .setDisabled(allDisabled),
        new ButtonBuilder()
          .setEmoji(parseEmoji(emojis.volumeUp) as any)
          .setStyle(ButtonStyle.Secondary)
          .setCustomId('player:volUp')
          .setDisabled(allDisabled || volume >= 100),
      ),
    )
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(footerText));

  return { components: [mainContainer], flags: MessageFlags.IsComponentsV2 };
}

/** CV2 payload shown in place of the now-playing panel once `player:stop` is pressed. */
export function buildPlayerStoppedPayload(trackTitle?: string): any {
  const container = new ContainerBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `${emojis.stop} Playback stopped${trackTitle ? ` — **${trackTitle}**` : ''}.`,
      ),
    )
    .addSeparatorComponents(new SeparatorBuilder())
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent('-# Disconnected from the voice channel.'),
    );

  return { components: [container], flags: MessageFlags.IsComponentsV2 };
}

export async function sendNowPlaying(
  context: NowPlayingContext,
  player: any,
  track: NowPlayingTrackInfo,
  options?: NowPlayingOptions,
): Promise<Message | void> {
  const payload = buildNowPlayingPayload(player, track, options) as any;

  if (context.interaction) {
    const interaction = context.interaction;
    if (interaction.deferred || interaction.replied) {
      return (await interaction.editReply(payload)) as Message;
    }
    return (await interaction.reply({ ...payload, fetchReply: true })) as unknown as Message;
  }

  if (context.message) {
    return await (context.message.channel as any).send(payload);
  }

  if (context.channel) {
    return await (context.channel as any).send(payload);
  }

  throw new Error('Invalid context');
}
