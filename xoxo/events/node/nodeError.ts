// xoxo/events/node/nodeError.ts
// Shoukaku event: 'error' — fires when a node emits an error
// Silences duplicate errors per node; clears on successful reconnect.

// Set of "nodeName::code" keys we have already logged.
const silenced = new Set<string>();

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
  if (hasConnectedNode(client, nodeName)) return;

  const code = errorCode(error);
  const key  = `${nodeName}::${code}`;
  if (silenced.has(key)) return;

  silenced.add(key);
  console.error(`[NODE] ❌ Lavalink node "${nodeName}" error: ${code}`);
};
