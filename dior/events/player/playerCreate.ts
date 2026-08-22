// xoxo/events/player/playerCreate.ts
// Kazagumo event: 'playerCreate' — fires when a player is created
// Args: (player: KazagumoPlayer)
import { getSession } from '../../helpers/sessionQueue.js';

export const name = 'playerCreate';
export const type = 'player';

export async function execute(client: any, player: any): Promise<void> {
  const guild = client.guilds.cache.get(player.guildId);
  if (!guild) return;

  console.log(`[PLAYER] ✨ Player created for ${guild.name} (${guild.id})`);

  // Initialize an empty session queue
  getSession(player);

  // Apply saved server volume
  if (client.db?.getGuildVolume) {
    const volume = await client.db.getGuildVolume(player.guildId).catch((): null => null);
    if (volume !== null) {
      player.data?.set?.('serverVolume', volume);
      await player.setVolume(volume).catch((): null => null);
    }
  }

  if (client.helpers?.updateVoiceStatus) {
    await client.helpers.updateVoiceStatus(player);
  }
}
