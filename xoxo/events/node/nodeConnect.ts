// xoxo/events/node/nodeConnect.ts
// Shoukaku event: 'ready' — fires when a node connects or resumes.
// Args: (name: string, resumed: boolean)

import { reconnectAllOnBoot, reconnectAfterNodeRecover } from '../../helpers/twentyFourSeven.js';
import { reportNodeReady }    from '../../helpers/nodeManager.js';
import { clearNodeSilence }   from './nodeError.js';

export const name = 'ready';
export const type = 'node';

export const execute = (client: any, nodeName: string, resumed: boolean): void => {
  // Tell the node manager this node is healthy — resets its failure counter.
  reportNodeReady(client, nodeName);
  // Clear any per-error-code silencing so fresh errors are logged after recovery.
  clearNodeSilence(nodeName);

  if (resumed) {
    console.log(`[NODE] 🔄 Lavalink node "${nodeName}" resumed session.`);
  } else {
    console.log(`[NODE] ✅ Lavalink node "${nodeName}" connected!`);
  }

  // createPlayer() needs a connected node, so this is the earliest safe
  // point to restore any guild's 24/7 voice connection.
  //
  // reconnectAllOnBoot() runs exactly once per process (guards against
  // re-running on every node reconnect at startup).
  //
  // reconnectAfterNodeRecover() runs every time a node connects — this
  // handles mid-session node failures where Shoukaku destroys all players
  // but voiceStateUpdate never fires. Without this, 24/7 connections are
  // permanently lost until the next bot restart.
  reconnectAllOnBoot(client).catch((err: Error) => {
    console.error(`[24-7] Boot reconnect pass threw: ${err.message}`);
  });

  reconnectAfterNodeRecover(client).catch((err: Error) => {
    console.error(`[24-7] Node-recover reconnect pass threw: ${err.message}`);
  });
};
