// xoxo/commands/music/stop.ts
import type { CassieClient } from '../../structures/CassieClient.js';
import { sendError, sendSuccess, sendInfo } from '../../components/statusMessages.js';
import { clearSession } from '../../helpers/sessionQueue.js';
import { clearPlayerState } from '../../helpers/nowPlayingManager.js';
import { clearRejoin } from '../../helpers/twentyFourSeven.js';

export const options = {
  name: 'stop',
  aliases: [] as string[],
  description: 'Stop playback and disconnect the bot. In 24/7 mode, stops the queue and keeps the bot in the voice channel.',
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

async function handle(ctx: { message?: any; interaction?: any; isSlash: boolean }, guildId: string, client: CassieClient) {
  const ctxObj = ctx.isSlash ? { interaction: ctx.interaction } : { message: ctx.message };
  const player  = (client as any).kazagumo.players.get(guildId);
  if (!player) return sendError(ctxObj, 'There is no active player in this server.');
  const hasCurrentTrack = !!player.queue?.current;
  const isPlaying = player.playing === true || player.paused === true;
  if (!hasCurrentTrack || !isPlaying) {
    return sendInfo(
      ctxObj,
      'There is no playback to stop. The bot is idle in the voice channel.',
    );
  }

  // If 24/7 mode is enabled, stop playback but keep the bot in the voice
  // channel. Destroying the player would cause voiceStateUpdate to fire and
  // schedule a rejoin (correct 24/7 behaviour), but it also briefly leaves
  // the channel which can confuse listeners and trigger edge cases. Stopping
  // in-place is cleaner: the bot stays put, the queue is cleared, and
  // someone can use $play to start fresh — or $24/7 disable + $stop to
  // fully disconnect.
  const is247 = await (client as any).db?.get24Seven?.(guildId).catch((): null => null);

  if (is247?.enabled) {
    clearPlayerState(guildId);
    clearSession(player);
    player.queue.clear();
    // Kazagumo has no stop() — clear the queue then skip so the current
    // track ends immediately. With an empty queue the player idles in place,
    // keeping the bot in the voice channel as 24/7 requires.
    player.skip();
    const prefix = (client as any).config?.prefix ?? '$';
    return sendInfo(
      ctxObj,
      `Stopped playback. Bot staying in <#${is247.channelId}> (24/7 mode is active).\n-# Use \`${prefix}24/7 disable\` then \`${prefix}stop\` to fully disconnect.`,
    );
  }

  // Normal stop — clear state and disconnect.
  clearPlayerState(guildId);
  clearSession(player);
  clearRejoin(guildId);
  await player.destroy();

  return sendSuccess(ctxObj, 'Stopped playback and disconnected.');
}

export async function prefixExecute(message: any, _args: string[], client: CassieClient) {
  await handle({ message, isSlash: false }, message.guild.id, client);
}
export async function slashExecute(interaction: any, client: CassieClient) {
  await interaction.deferReply();
  await handle({ interaction, isSlash: true }, interaction.guild.id, client);
}
