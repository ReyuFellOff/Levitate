// xoxo/commands/music/volume.ts
import type { LevitateClient } from '../../structures/LevitateClient.js';
import { sendError, sendSuccess, sendInfo } from '../../components/statusMessages.js';
import { updateNowPlayingMessage } from '../../helpers/nowPlayingManager.js';

export const options = {
  name: 'volume',
  aliases: ['vol', 'v'] as string[],
  description: 'Set or view the playback volume (1-100).',
  usage: 'volume [1-100]',
  category: 'music',
  isDeveloper: false,
  userPerms: [] as string[],
  botPerms: [] as string[],
  player: true,
  inVoiceChannel: true,
  sameVoiceChannel: true,
  cooldown: 2,
};

async function handle(ctx: { message?: any; interaction?: any; isSlash: boolean }, guildId: string, volumeArg: string | null, client: LevitateClient) {
  const ctxObj = ctx.isSlash ? { interaction: ctx.interaction } : { message: ctx.message };
  const player  = (client as any).kazagumo.players.get(guildId);
  if (!player?.queue?.current) return sendError(ctxObj, 'There is nothing currently playing.');

  if (!volumeArg) {
    return sendInfo(ctxObj, `Current volume: **${player.volume}%**`);
  }

  const vol = parseInt(volumeArg, 10);
  if (isNaN(vol) || vol < 1 || vol > 100) {
    return sendError(ctxObj, 'Volume must be a number between **1** and **100**.');
  }

  await player.setVolume(vol);
  await updateNowPlayingMessage(client as any, player).catch((): null => null);
  return sendSuccess(ctxObj, `Volume set to **${vol}%**.`);
}

export async function prefixExecute(message: any, args: string[], client: LevitateClient) {
  await handle({ message, isSlash: false }, message.guild.id, args[0] ?? null, client);
}
export async function slashExecute(interaction: any, client: LevitateClient) {
  await interaction.deferReply();
  const vol = interaction.options.getInteger('volume', false);
  await handle({ interaction, isSlash: true }, interaction.guild.id, vol?.toString() ?? null, client);
}
