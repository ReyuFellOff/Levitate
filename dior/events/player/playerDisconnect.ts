// xoxo/events/player/playerDisconnect.ts
// Kazagumo event: 'playerDestroy' — fires when a player is destroyed
// Args: (player: KazagumoPlayer)
import { clearPlayerState } from '../../helpers/nowPlayingManager.js';
import { clearRejoin } from '../../helpers/twentyFourSeven.js';
import { clearSession } from '../../helpers/sessionQueue.js';

export const name = 'playerDestroy';
export const type = 'player';

export async function execute(client: any, player: any): Promise<void> {
  const guild = client.guilds.cache.get(player.guildId);
  const guildName = guild?.name || player.guildId;

  console.log(`[PLAYER] 💀 Player destroyed for ${guildName}`);

  clearPlayerState(player.guildId);
  clearRejoin(player.guildId);
  clearSession(player);

  if (client.helpers?.cancelInactivityTimer) {
    client.helpers.cancelInactivityTimer(player.guildId);
  }
  if (client.helpers?.updateVoiceStatus) {
    await client.helpers.updateVoiceStatus(player).catch(() => {});
  }
}
