// xoxo/events/player/trackStart.ts
// Kazagumo event: 'playerStart' — fires when a track begins playing
// Args: (player: KazagumoPlayer, track: KazagumoTrack)
import { deleteOldNowPlayingMessage, sendNowPlayingMessage } from '../../helpers/nowPlayingManager.js';
import { clearRejoin } from '../../helpers/twentyFourSeven.js';
import { syncToPlayer } from '../../helpers/sessionQueue.js';

export const name = 'playerStart';
export const type = 'player';

export async function execute(client: any, player: any, track: any): Promise<void> {
  const guild = client.guilds.cache.get(player.guildId);
  if (!guild) return;

  syncToPlayer(player);

  if (client.helpers?.cancelInactivityTimer) {
    client.helpers.cancelInactivityTimer(player.guildId);
  }

  clearRejoin(player.guildId);

  console.log(`[PLAYER] 🎵 Now playing: ${track.title} by ${track.author} in ${guild.name}`);

  await deleteOldNowPlayingMessage(client, player.guildId);

  await sendNowPlayingMessage(client, player, track).catch((err: any) => {
    console.error(`[NOWPLAYING] Failed to send now playing: ${err.message}`);
  });

  if (client.helpers?.updateVoiceStatus) {
    await client.helpers.updateVoiceStatus(player);
  }
}
