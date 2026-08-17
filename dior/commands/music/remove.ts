// xoxo/commands/music/remove.ts
import type { LevitateClient } from '../../structures/LevitateClient.js';
import { sendError, sendSuccess } from '../../components/statusMessages.js';
import { removeUpcoming } from '../../helpers/sessionQueue.js';
import { updateNowPlayingMessage } from '../../helpers/nowPlayingManager.js';

export const options = {
  name: 'remove',
  aliases: ['rm'] as string[],
  description: 'Remove a track from the queue by position.',
  usage: 'remove <position>',
  category: 'music',
  isDeveloper: false,
  userPerms: [] as string[],
  botPerms: [] as string[],
  player: true,
  inVoiceChannel: true,
  sameVoiceChannel: true,
  cooldown: 2,
};

async function handle(ctx: { message?: any; interaction?: any; isSlash: boolean }, guildId: string, posArg: string | null, client: LevitateClient) {
  const ctxObj = ctx.isSlash ? { interaction: ctx.interaction } : { message: ctx.message };
  const player  = (client as any).kazagumo.players.get(guildId);
  if (!player?.queue?.current) return sendError(ctxObj, 'There is nothing currently playing.');
  if (!player.queue.length) return sendError(ctxObj, 'The queue is empty.');

  if (!posArg) return sendError(ctxObj, 'Please provide a queue position to remove.');

  const pos = parseInt(posArg, 10);
  if (isNaN(pos) || pos < 1 || pos > player.queue.length) {
    return sendError(ctxObj, `Position must be between **1** and **${player.queue.length}**.`);
  }

  const track = player.queue[pos - 1];
  player.queue.remove(pos - 1);
  removeUpcoming(player, pos);
  await updateNowPlayingMessage(client as any, player).catch((): null => null);

  return sendSuccess(ctxObj, `Removed **${track?.title ?? 'track'}** from position **${pos}**.`);
}

export async function prefixExecute(message: any, args: string[], client: LevitateClient) {
  await handle({ message, isSlash: false }, message.guild.id, args[0] ?? null, client);
}
export async function slashExecute(interaction: any, client: LevitateClient) {
  await interaction.deferReply();
  await handle({ interaction, isSlash: true }, interaction.guild.id, interaction.options.getInteger('position', true).toString(), client);
}
