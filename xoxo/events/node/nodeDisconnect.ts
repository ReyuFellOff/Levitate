// xoxo/events/node/nodeDisconnect.ts
// Shoukaku event: 'disconnect' — fires when a node disconnects.
// Args: (name: string, players: Player[], moved: boolean)

import { reportNodeGaveUp } from '../../helpers/nodeManager.js';

export const name = 'disconnect';
export const type = 'node';

export const execute = (client: any, nodeName: string, _players: any[], moved: boolean): void => {
  if (moved) {
    // Players were automatically migrated to another node — normal operation.
    console.warn(`[NODE] ⚠️ Lavalink node "${nodeName}" disconnected — players moved to another node.`);
    return;
  }

  // Connection lost and Shoukaku has removed the node from its pool.
  // Hand off to the node manager so it can connect the next node in priority order.
  console.warn(`[NODE] ⚠️ Lavalink node "${nodeName}" disconnected — handing off to node manager.`);
  reportNodeGaveUp(client, nodeName);
};
