// xoxo/commands/music/move.ts
import type { CassieClient } from '../../structures/CassieClient.js';
import { sendError, sendSuccess } from '../../components/statusMessages.js';
import { moveUpcoming } from '../../helpers/sessionQueue.js';
import { updateNowPlayingMessage } from '../../helpers/nowPlayingManager.js';

export const options = {
  name: 'move',
  aliases: ['mv'] as string[],
  description: 'Move a track in the queue from one position to another.',
  usage: 'move <from> <to>',
  category: 'music',
  isDeveloper: false,
  userPerms: [] as string[],
  botPerms: [] as string[],
  player: true,
  inVoiceChannel: true,
  sameVoiceChannel: true,
  cooldown: 2,
};

async function handle(ctx: { message?: any; interaction?: any; isSlash: boolean }, guildId: string, fromArg: string | null, toArg: string | null, client: CassieClient) {
  const ctxObj = ctx.isSlash ? { interaction: ctx.interaction } : { message: ctx.message };
  const player  = (client as any).kazagumo.players.get(guildId);
  if (!player?.queue?.current) return sendError(ctxObj, 'There is nothing currently playing.');
  if (player.queue.length < 2) return sendError(ctxObj, 'There must be at least 2 tracks in the queue to move.');

  if (!fromArg || !toArg) return sendError(ctxObj, 'Please provide two positions: `move <from> <to>`.');

  const from = parseInt(fromArg, 10);
  const to   = parseInt(toArg, 10);
  const max  = player.queue.length;

  if (isNaN(from) || from < 1 || from > max) return sendError(ctxObj, `"from" position must be between **1** and **${max}**.`);
  if (isNaN(to)   || to   < 1 || to   > max) return sendError(ctxObj, `"to" position must be between **1** and **${max}**.`);
  if (from === to) return sendError(ctxObj, 'From and to positions are the same.');

  const track = player.queue[from - 1];
  const tracks = [...player.queue];
  tracks.splice(from - 1, 1);
  tracks.splice(to - 1, 0, track);
  player.queue.clear();
  player.queue.add(tracks);
  moveUpcoming(player, from, to);
  await updateNowPlayingMessage(client as any, player).catch((): null => null);

  return sendSuccess(ctxObj, `Moved **${track?.title ?? 'track'}** from position **${from}** to **${to}**.`);
}

export async function prefixExecute(message: any, args: string[], client: CassieClient) {
  await handle({ message, isSlash: false }, message.guild.id, args[0] ?? null, args[1] ?? null, client);
}
export async function slashExecute(interaction: any, client: CassieClient) {
  await interaction.deferReply();
  await handle(
    { interaction, isSlash: true },
    interaction.guild.id,
    interaction.options.getInteger('from', true).toString(),
    interaction.options.getInteger('to', true).toString(),
    client,
  );
}
