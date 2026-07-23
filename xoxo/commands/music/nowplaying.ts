// xoxo/commands/music/nowplaying.ts
import type { LevitateClient } from '../../structures/LevitateClient.js';
import { sendError } from '../../components/statusMessages.js';
import { sendNowPlaying } from '../../components/music/nowPlaying.js';
import { buildTrackInfo } from '../../helpers/nowPlayingManager.js';

export const options = {
  name: 'nowplaying',
  aliases: ['np', 'song', 'current'] as string[],
  description: 'Show the currently playing track.',
  usage: 'nowplaying',
  category: 'music',
  isDeveloper: false,
  userPerms: [] as string[],
  botPerms: [] as string[],
  player: true,
  inVoiceChannel: false,
  sameVoiceChannel: false,
  cooldown: 3,
};

async function handle(ctx: { message?: any; interaction?: any; isSlash: boolean }, guildId: string, client: LevitateClient) {
  const ctxObj = ctx.isSlash ? { interaction: ctx.interaction } : { message: ctx.message };
  const player  = (client as any).kazagumo.players.get(guildId);
  if (!player?.queue?.current) return sendError(ctxObj, 'There is nothing currently playing.');

  const track     = player.queue.current;
  const prefix    = (client as any).config?.prefix;
  const trackInfo = buildTrackInfo(player, track);

  await sendNowPlaying(ctxObj as any, player, trackInfo, { prefix });
}

export async function prefixExecute(message: any, _args: string[], client: LevitateClient) {
  await handle({ message, isSlash: false }, message.guild.id, client);
}
export async function slashExecute(interaction: any, client: LevitateClient) {
  await handle({ interaction, isSlash: true }, interaction.guild.id, client);
}
