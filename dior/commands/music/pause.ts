// xoxo/commands/music/pause.ts
import type { CassieClient } from '../../structures/CassieClient.js';
import { sendError, sendSuccess } from '../../components/statusMessages.js';
import { updateNowPlayingMessage } from '../../helpers/nowPlayingManager.js';

export const options = {
  name: 'pause',
  aliases: [] as string[],
  description: 'Pause the currently playing track.',
  usage: 'pause',
  category: 'music',
  isDeveloper: false,
  userPerms: [] as string[],
  botPerms: [] as string[],
  player: true,
  inVoiceChannel: true,
  sameVoiceChannel: true,
  cooldown: 2,
};

async function handle(ctx: { message?: any; interaction?: any; isSlash: boolean }, guildId: string, client: CassieClient) {
  const ctxObj = ctx.isSlash ? { interaction: ctx.interaction } : { message: ctx.message };
  const player  = (client as any).kazagumo.players.get(guildId);
  if (!player?.queue?.current) return sendError(ctxObj, 'There is nothing currently playing.');
  if (player.paused) return sendError(ctxObj, 'The player is already paused.');

  player.pause(true);
  await updateNowPlayingMessage(client as any, player).catch((): null => null);
  return sendSuccess(ctxObj, 'Paused playback.');
}

export async function prefixExecute(message: any, _args: string[], client: CassieClient) {
  await handle({ message, isSlash: false }, message.guild.id, client);
}
export async function slashExecute(interaction: any, client: CassieClient) {
  await interaction.deferReply();
  await handle({ interaction, isSlash: true }, interaction.guild.id, client);
}
