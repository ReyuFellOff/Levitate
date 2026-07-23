// xoxo/commands/music/stop.ts
import type { LevitateClient } from '../../structures/LevitateClient.js';
import { sendError, sendSuccess } from '../../components/statusMessages.js';
import { clearSession } from '../../helpers/sessionQueue.js';
import { clearPlayerState } from '../../helpers/nowPlayingManager.js';
import { clearRejoin } from '../../helpers/twentyFourSeven.js';

export const options = {
  name: 'stop',
  aliases: ['dc', 'disconnect'] as string[],
  description: 'Stop playback and disconnect the bot.',
  usage: 'stop',
  category: 'music',
  isDeveloper: false,
  userPerms: [] as string[],
  botPerms: [] as string[],
  player: true,
  inVoiceChannel: true,
  sameVoiceChannel: true,
  cooldown: 3,
};

async function handle(ctx: { message?: any; interaction?: any; isSlash: boolean }, guildId: string, client: LevitateClient) {
  const ctxObj = ctx.isSlash ? { interaction: ctx.interaction } : { message: ctx.message };
  const player  = (client as any).kazagumo.players.get(guildId);
  if (!player) return sendError(ctxObj, 'There is no active player in this server.');

  clearPlayerState(guildId);
  clearSession(player);
  clearRejoin(guildId);
  await player.destroy();

  return sendSuccess(ctxObj, 'Stopped playback and disconnected.');
}

export async function prefixExecute(message: any, _args: string[], client: LevitateClient) {
  await handle({ message, isSlash: false }, message.guild.id, client);
}
export async function slashExecute(interaction: any, client: LevitateClient) {
  await interaction.deferReply();
  await handle({ interaction, isSlash: true }, interaction.guild.id, client);
}
