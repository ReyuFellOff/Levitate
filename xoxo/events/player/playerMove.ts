// xoxo/events/player/playerMove.ts
// Kazagumo event: 'playerResumed' — fires when a player is moved to a new node
// Args: (player: KazagumoPlayer)

export const name = 'playerResumed';
export const type = 'player';

export async function execute(client: any, player: any): Promise<void> {
  const guild = client.guilds.cache.get(player.guildId);
  const guildName = guild?.name || player.guildId;
  console.log(`[PLAYER] ↗️ Player resumed/moved for ${guildName}`);
}
