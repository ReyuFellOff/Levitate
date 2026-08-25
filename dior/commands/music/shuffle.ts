// xoxo/commands/music/shuffle.ts
import type { CassieClient } from '../../structures/CassieClient.js';
import { sendError, sendSuccess } from '../../components/statusMessages.js';
import { shuffleUpcoming } from '../../helpers/sessionQueue.js';
import { updateNowPlayingMessage } from '../../helpers/nowPlayingManager.js';

export const options = {
  name: 'shuffle',
  aliases: ['sh'] as string[],
  description: 'Shuffle the upcoming tracks in the queue.',
  usage: 'shuffle',
  category: 'music',
  isDeveloper: false,
  userPerms: [] as string[],
  botPerms: [] as string[],
  player: true,
  inVoiceChannel: true,
  sameVoiceChannel: true,
  cooldown: 3,
};

async function handle(ctx: { message?: any; interaction?: any; isSlash: boolean }, guildId: string, client: CassieClient) {
  const ctxObj = ctx.isSlash ? { interaction: ctx.interaction } : { message: ctx.message };
  const player  = (client as any).kazagumo.players.get(guildId);
  if (!player?.queue?.current) return sendError(ctxObj, 'There is nothing currently playing.');
  if (!player.queue.length) return sendError(ctxObj, 'There are no upcoming tracks to shuffle.');

  player.queue.shuffle();
  shuffleUpcoming(player);
  await updateNowPlayingMessage(client as any, player).catch((): null => null);
  return sendSuccess(ctxObj, `Shuffled **${player.queue.length}** tracks in the queue.`);
}

export async function prefixExecute(message: any, _args: string[], client: CassieClient) {
  await handle({ message, isSlash: false }, message.guild.id, client);
}
export async function slashExecute(interaction: any, client: CassieClient) {
  await interaction.deferReply();
  await handle({ interaction, isSlash: true }, interaction.guild.id, client);
}
