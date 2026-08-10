// xoxo/events/player/socketClosed.ts
// Kazagumo event: 'playerClosed' — fires when the voice WebSocket connection closes
// Args: (player: KazagumoPlayer, data: WebSocketClosedEvent)

export const name = 'playerClosed';
export const type = 'player';

export async function execute(client: any, player: any, data: any): Promise<void> {
  const guild     = client.guilds.cache.get(player.guildId);
  const guildName = guild?.name || player.guildId;

  console.warn(`[PLAYER] 🔌 Voice socket closed for ${guildName} (code: ${data?.code}, reason: ${data?.reason})`);
}
