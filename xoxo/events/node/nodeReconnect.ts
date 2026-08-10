// xoxo/events/node/nodeReconnect.ts
// Shoukaku has no separate 'nodeReconnect' event — reconnection is signalled by
// the 'ready' event with resumed=true (handled in nodeConnect.ts).
// This file is kept for structural consistency but will never fire.

export const name = 'nodeReconnect';
export const type = 'node';

export const execute = (_client: any, nodeName: string): void => {
  console.log(`[NODE] 🔄 Lavalink node "${nodeName}" reconnected.`);
};
