// xoxo/events/node/nodeDisconnect.ts
// Shoukaku event: 'disconnect' — fires when a node disconnects
// Args: (name: string, players: Player[], moved: boolean)

export const name = 'disconnect';
export const type = 'node';

export const execute = (_client: any, nodeName: string, _players: any[], moved: boolean): void => {
  const reason = moved ? 'players moved to another node' : 'connection lost';
  console.warn(`[NODE] ⚠️ Lavalink node "${nodeName}" disconnected. Reason: ${reason}`);
};
