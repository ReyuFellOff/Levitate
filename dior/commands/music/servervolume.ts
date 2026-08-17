// xoxo/commands/music/servervolume.ts
// Set the persistent default volume for this server.
import type { LevitateClient } from '../../structures/LevitateClient.js';
import { sendError, sendSuccess, sendInfo } from '../../components/statusMessages.js';
import { updateNowPlayingMessage } from '../../helpers/nowPlayingManager.js';

export const options = {
  name: 'servervolume',
  aliases: ['svol', 'sv'] as string[],
  description: 'Set the persistent default volume for this server (1-100). Requires Manage Guild.',
  usage: 'servervolume [1-100]',
  category: 'music',
  isDeveloper: false,
  userPerms: ['ManageGuild'] as string[],
  botPerms: [] as string[],
  player: false,
  inVoiceChannel: false,
  sameVoiceChannel: false,
  cooldown: 5,
};

async function handle(ctx: { message?: any; interaction?: any; isSlash: boolean }, guildId: string, volumeArg: string | null, client: LevitateClient) {
  const ctxObj = ctx.isSlash ? { interaction: ctx.interaction } : { message: ctx.message };

  if (!volumeArg) {
    const saved = await (client as any).db?.getGuildVolume?.(guildId).catch((): null => null);
    return sendInfo(ctxObj, saved
      ? `Server default volume: **${saved}%**`
      : 'No server default volume is set. Use `servervolume <1-100>` to set one.');
  }

  const vol = parseInt(volumeArg, 10);
  if (isNaN(vol) || vol < 1 || vol > 100) {
    return sendError(ctxObj, 'Volume must be a number between **1** and **100**.');
  }

  await (client as any).db?.setGuildVolume?.(guildId, vol).catch((): null => null);

  // Apply to the current player if one exists
  const player = (client as any).kazagumo.players.get(guildId);
  if (player) {
    player.data?.set?.('serverVolume', vol);
    await player.setVolume(vol);
    await updateNowPlayingMessage(client as any, player).catch((): null => null);
  }

  return sendSuccess(ctxObj, `Server default volume set to **${vol}%**.`);
}

export async function prefixExecute(message: any, args: string[], client: LevitateClient) {
  await handle({ message, isSlash: false }, message.guild.id, args[0] ?? null, client);
}
export async function slashExecute(interaction: any, client: LevitateClient) {
  await interaction.deferReply();
  const vol = interaction.options.getInteger('volume', false);
  await handle({ interaction, isSlash: true }, interaction.guild.id, vol?.toString() ?? null, client);
}
