// xoxo/commands/music/servervolume.ts
// Set the persistent server-wide playback volume.
import type { CassieClient } from '../../structures/CassieClient.js';
import { sendError, sendInfo, sendSuccess } from '../../components/statusMessages.js';
import { sendWrongUsage } from '../../components/wrongUsage.js';
import { updateNowPlayingMessage } from '../../helpers/nowPlayingManager.js';

export const options = {
  name: 'servervolume',
  aliases: ['svol', 'sv'] as string[],
  description: 'Set or reset the persistent server-wide playback volume.',
  usage: `servervolume <0-200>
  servervolume reset`,
  category: 'music',
  isDeveloper: false,
  userPerms: ['ManageGuild'] as string[],
  botPerms: [] as string[],
  player: false,
  inVoiceChannel: false,
  sameVoiceChannel: false,
  cooldown: 3,
};

async function handle(ctx: { message?: any; interaction?: any; isSlash: boolean }, guildId: string, volumeArg: string, client: CassieClient) {
  const ctxObj = ctx.isSlash ? { interaction: ctx.interaction } : { message: ctx.message };
  const player = client.kazagumo.players.get(guildId) as any;

  if (volumeArg.toLowerCase() === 'reset') {
    const removed = await client.db.removeGuildVolume(guildId);
    if (player) player.data?.set?.('serverVolume', undefined);
    if (!removed) return sendInfo(ctxObj, 'No server volume was set.');
    if (player) await updateNowPlayingMessage(client, player).catch((): null => null);
    return sendSuccess(ctxObj, 'Server volume reset. New players will use the default volume.');
  }

  const vol = parseInt(volumeArg, 10);
  if (isNaN(vol) || vol < 0 || vol > 200) {
    return sendError(ctxObj, 'Volume must be a number between **0** and **200**, or `reset`.');
  }

  await client.db.setGuildVolume(guildId, vol);

  if (player) {
    player.data?.set?.('serverVolume', vol);
    await player.setVolume(vol).catch((): null => null);
    await updateNowPlayingMessage(client, player).catch((): null => null);
  }

  return sendSuccess(ctxObj, `Server volume set to **${vol}%**. This will persist for all future players.`);
}

export async function prefixExecute(message: any, args: string[], client: CassieClient) {
  if (!args.length) return sendWrongUsage({ message, client }, options.name, options.usage);
  await handle({ message, isSlash: false }, message.guild.id, args[0], client);
}
export async function slashExecute(interaction: any, client: CassieClient) {
  await interaction.deferReply();
  const value = interaction.options.getString('value', true);
  await handle({ interaction, isSlash: true }, interaction.guild.id, value, client);
}
