// xoxo/commands/music/seek.ts
import type { LevitateClient } from '../../structures/LevitateClient.js';
import { sendError, sendSuccess } from '../../components/statusMessages.js';
import { parseTime, TimeParseError, TIME_FORMAT_HELP } from '../../utils/parseTime.js';
import { updateNowPlayingMessage } from '../../helpers/nowPlayingManager.js';

export const options = {
  name: 'seek',
  aliases: [] as string[],
  description: 'Seek to a position in the current track.',
  usage: 'seek <time>  (e.g. 1:30, 1m 30s, 90)',
  category: 'music',
  isDeveloper: false,
  userPerms: [] as string[],
  botPerms: [] as string[],
  player: true,
  inVoiceChannel: true,
  sameVoiceChannel: true,
  cooldown: 3,
};

async function handle(ctx: { message?: any; interaction?: any; isSlash: boolean }, guildId: string, timeArg: string | null, client: LevitateClient) {
  const ctxObj = ctx.isSlash ? { interaction: ctx.interaction } : { message: ctx.message };
  const player  = (client as any).kazagumo.players.get(guildId);
  if (!player?.queue?.current) return sendError(ctxObj, 'There is nothing currently playing.');

  const track = player.queue.current;
  if (track.isStream) return sendError(ctxObj, 'Cannot seek in a livestream.');
  if (!track.isSeekable) return sendError(ctxObj, 'This track is not seekable.');

  if (!timeArg) return sendError(ctxObj, `Please provide a time to seek to. ${TIME_FORMAT_HELP}`);

  let ms: number;
  try {
    ms = parseTime(timeArg);
  } catch (err) {
    if (err instanceof TimeParseError) {
      return sendError(ctxObj, `${err.message} ${TIME_FORMAT_HELP}`);
    }
    return sendError(ctxObj, `Invalid time format. ${TIME_FORMAT_HELP}`);
  }

  const length = track.length ?? 0;
  if (length > 0 && ms >= length) {
    return sendError(ctxObj, `Seek position exceeds track duration (**${Math.floor(length / 1000)}s**).`);
  }

  try {
    await player.seekTo(ms);
  } catch {
    return sendError(ctxObj, 'Failed to seek. The track may not support seeking at this time.');
  }
  await updateNowPlayingMessage(client as any, player).catch((): null => null);

  const secs = Math.floor(ms / 1000);
  const m = Math.floor(secs / 60), s = secs % 60;
  return sendSuccess(ctxObj, `Seeked to **${m}:${String(s).padStart(2, '0')}**.`);
}

export async function prefixExecute(message: any, args: string[], client: LevitateClient) {
  await handle({ message, isSlash: false }, message.guild.id, args.join(' ') || null, client);
}
export async function slashExecute(interaction: any, client: LevitateClient) {
  await interaction.deferReply();
  await handle({ interaction, isSlash: true }, interaction.guild.id, interaction.options.getString('time', true), client);
}
