// xoxo/events/player/playerUpdate.ts
// Kazagumo event: 'playerUpdate' — fires periodically with position updates
// Args: (player: KazagumoPlayer, state: { position: number; ... })
import { setPositionSnapshot } from '../../helpers/nowPlayingManager.js';

export const name = 'playerUpdate';
export const type = 'player';

export function execute(client: any, player: any, state: any): void {
  if (typeof state?.position === 'number') {
    setPositionSnapshot(player.guildId, state.position);
  }
}
