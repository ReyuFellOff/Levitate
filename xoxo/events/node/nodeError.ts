// xoxo/events/node/nodeError.ts
// Shoukaku event: 'error' — fires when a node emits an error.
//
// Routes errors through the node manager's failure counter so persistent error
// storms can trigger a failover to the next node. Also silences duplicate error
// codes per node to avoid repeating the same error message endlessly.

import { reportNodeFailure } from '../../helpers/nodeManager.js';

// Set of "nodeName::code" keys we have already logged.
const silenced = new Set<string>();

/** Clear per-node error silencing when that node successfully (re)connects. */
export function clearNodeSilence(nodeName: string): void {
  for (const key of silenced) {
    if (key.startsWith(`${nodeName}::`)) silenced.delete(key);
  }
}

function errorCode(err: any): string {
  if (typeof err === 'string') return err;
  if (err?.code) return String(err.code);
  return err?.constructor?.name ?? err?.name ?? 'unknown';
}

function hasConnectedNode(client: any, errorNodeName: string): boolean {
  const nodes: Map<string, any> = client?.kazagumo?.shoukaku?.nodes;
  if (!nodes) return false;
  for (const [name, node] of nodes) {
    if (name !== errorNodeName && node.state === 1) return true;
  }
  return false;
}

export const name = 'error';
export const type = 'node';

export const execute = (client: any, nodeName: string, error: any): void => {
  // Notify the node manager — counts toward the failover threshold.
  const failedOver = reportNodeFailure(client, nodeName);
  if (failedOver) return; // Manager already logged a clear failover message.

  // If another node is already connected, suppress noise from this one.
  if (hasConnectedNode(client, nodeName)) return;

  const code = errorCode(error);
  const key  = `${nodeName}::${code}`;
  if (silenced.has(key)) return;

  silenced.add(key);
  console.error(`[NODE] ❌ Lavalink node "${nodeName}" error: ${code}`);
};
