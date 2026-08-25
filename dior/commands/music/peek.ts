// xoxo/commands/music/peek.ts
// Preview any queued track by position number without affecting playback.
import type { CassieClient } from '../../structures/CassieClient.js';
import { sendError } from '../../components/statusMessages.js';
import { sendWrongUsage } from '../../components/wrongUsage.js';
import { sendNowPlaying } from '../../components/music/nowPlaying.js';
import { extractThumbnail, formatDuration } from '../../utils/formatting.js';
import { generateNowPlayingCanvas } from '../../structures/NowPlayingCanvas.js';

export const options = {
  name: 'peek',
  aliases: [] as string[],
  description: 'Preview a queued track by its position number.',
  usage: 'peek <position>',
  category: 'music',
  isDeveloper: false,
  userPerms: [] as string[],
  botPerms: [] as string[],
  player: true,
  inVoiceChannel: false,
  sameVoiceChannel: false,
  cooldown: 3,
};

async function handle(
  ctx: { message?: any; interaction?: any; isSlash: boolean },
  guildId: string,
  position: number,
  client: CassieClient,
) {
  const ctxObj = ctx.isSlash ? { interaction: ctx.interaction } : { message: ctx.message };
  const player  = (client as any).kazagumo.players.get(guildId) as any;

  if (!player?.queue?.current) return sendError(ctxObj, 'There is nothing currently playing.');

  if (!player.queue.length) return sendError(ctxObj, 'The queue is empty — there are no upcoming tracks to peek at.');

  if (position < 1 || position > player.queue.length) {
    return sendError(ctxObj, `Position must be between **1** and **${player.queue.length}**.`);
  }

  const track = player.queue[position - 1];
  if (!track) return sendError(ctxObj, 'Could not find that track in the queue.');

  const prefix = (client as any).config?.prefix;

  const trackInfo = {
    title:             track.title,
    artist:            track.author || 'Unknown',
    url:               track.uri,
    sourceName:        track.sourceName || 'Unknown',
    durationFormatted: track.length ? formatDuration(track.length) : 'LIVE',
    currentFormatted:  '00:00',
    progress:          0,
    thumbnailUrl:      (track.thumbnail ?? extractThumbnail(track) ?? undefined) as string | undefined,
    volume:            player.volume ?? 100,
    isServerVolume:    false,
    requestedBy:       (track.requester as any)?.username as string | undefined,
  };

  const canvasBuffer = await generateNowPlayingCanvas({
    title:             trackInfo.title,
    artist:            trackInfo.artist,
    currentFormatted:  trackInfo.currentFormatted,
    durationFormatted: trackInfo.durationFormatted,
    progress:          0,
    volume:            trackInfo.volume,
    requestedBy:       trackInfo.requestedBy,
    thumbnailUrl:      trackInfo.thumbnailUrl,
    isLive:            trackInfo.durationFormatted === 'LIVE',
  }).catch((): null => null);

  await sendNowPlaying(ctxObj as any, player, trackInfo, {
    isPeek:       true,
    prefix,
    canvasBuffer: canvasBuffer ?? undefined,
  });
}

export async function prefixExecute(message: any, args: string[], client: CassieClient) {
  if (!args.length) return sendWrongUsage({ message, client }, options.name, options.usage);
  const position = parseInt(args[0]!, 10);
  if (isNaN(position) || position < 1) {
    return sendError({ message }, 'Please provide a valid position number (e.g. `peek 2`).');
  }
  await handle({ message, isSlash: false }, message.guild.id, position, client);
}

export async function slashExecute(interaction: any, client: CassieClient) {
  await interaction.deferReply();
  const position = interaction.options.getInteger('position', true);
  await handle({ interaction, isSlash: true }, interaction.guild.id, position, client);
}
