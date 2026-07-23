// xoxo/events/node/nodeDestroy.ts
// Shoukaku event: 'close' — fires when a node connection closes
// Args: (name: string, code: number, reason: string)

export const name = 'close';
export const type = 'node';

export const execute = (_client: any, nodeName: string, code: number, reason: string): void => {
  console.warn(`[NODE] 💀 Lavalink node "${nodeName}" closed. Code: ${code}, Reason: ${reason || 'None'}`);
};
