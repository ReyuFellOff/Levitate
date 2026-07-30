// xoxo/helpers/nodeManager.ts
//
// Sequential single-active-node Lavalink failover.
//
// The old bootstrap added every configured node to Shoukaku at once, so all
// of them dialed in parallel forever. Shoukaku's own per-node reconnect loop
// also can't be trusted to ever "give up" on a flaky node: reconnectTries
// only governs the case where the WebSocket fails to open at all. If a node
// accepts the WS upgrade and then drops the socket moments later (the
// "closed. Code: 1006" case), `Node.close()` unconditionally calls
// `Node.connect()` again with no backoff — so a node that opens-then-drops
// repeatedly loops forever, spamming the close event with no cooldown.
//
// This module owns that decision instead: only one node is ever added to
// Shoukaku's pool at a time, in priority order (best node first). We track
// failures for the active node ourselves and fail over to the next node in
// the list once it proves unhealthy, wrapping back to the top of the list
// (with a cooldown) once every node has been tried.

interface NodeConfig {
  name: string;
  host: string;
  port: number;
  auth: string;
  secure: boolean;
}

const UNHEALTHY_FAILURE_COUNT = 3;      // this many close/error events...
const UNHEALTHY_WINDOW_MS     = 20_000; // ...within this window means "unhealthy"
const WRAP_AROUND_COOLDOWN_MS = 30_000; // pause before retrying the top of the list again

let priorityList: NodeConfig[] = [];
let activeIndex = -1;
let failureTimestamps: number[] = [];

function toShoukakuOption(n: NodeConfig) {
  return {
    name: n.name,
    url: `${n.host}:${n.port}`,
    auth: n.auth,
    secure: n.secure,
  };
}

function connectNext(client: any): void {
  if (priorityList.length === 0) return;

  const nextIndex = (activeIndex + 1) % priorityList.length;
  const wrapping = nextIndex === 0 && activeIndex !== -1; // been all the way around already

  activeIndex = nextIndex;
  failureTimestamps = [];

  const cfg = priorityList[activeIndex];
  const doConnect = () => {
    console.log(`[NODE] 🔌 Attempting "${cfg.name}" (priority ${activeIndex + 1}/${priorityList.length})...`);
    client.kazagumo.shoukaku.addNode(toShoukakuOption(cfg));
  };

  if (wrapping) {
    console.warn(`[NODE] ⏳ All configured Lavalink nodes are down — retrying from the top in ${WRAP_AROUND_COOLDOWN_MS / 1000}s.`);
    setTimeout(doConnect, WRAP_AROUND_COOLDOWN_MS);
  } else {
    doConnect();
  }
}

/** Neuter + drop the currently-active node so its internal reconnect loop stops for good.
 *
 * Shoukaku's `close()` handler unconditionally calls `connect()` again on
 * every socket close, even ones we trigger ourselves — there is no public
 * "give up permanently" API. Overwriting the instance's own `connect` with a
 * no-op (shadowing the prototype method) turns that built-in retry loop into
 * a no-op once we remove the node from the pool.
 */
function abandonActiveNode(client: any): void {
  const shoukaku = client?.kazagumo?.shoukaku;
  const cfg = priorityList[activeIndex];
  if (!cfg || !shoukaku) return;

  const node = shoukaku.nodes.get(cfg.name);
  if (!node) return;

  node.connect = async (): Promise<void> => {};
  try {
    shoukaku.removeNode(cfg.name, 'Failover: node unhealthy');
  } catch {
    // Already gone — fine.
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/** Call once at boot, after Kazagumo is initialised. Connects only the top-priority node. */
export function startNodeManager(client: any, nodes: NodeConfig[]): void {
  priorityList = nodes.slice();
  activeIndex = -1;
  failureTimestamps = [];
  connectNext(client);
}

/** Call from the node 'ready' handler when a node comes up. Resets its failure count. */
export function reportNodeReady(nodeName: string): void {
  if (priorityList[activeIndex]?.name === nodeName) {
    failureTimestamps = [];
  }
}

/**
 * Call from 'close' / 'error' node handlers. Counts the failure toward the
 * unhealthy threshold and fails over once it's exceeded.
 * Returns true if a failover was triggered this call (caller should skip its
 * own log line — the manager already logged a clear failover message).
 */
export function reportNodeFailure(client: any, nodeName: string): boolean {
  if (priorityList[activeIndex]?.name !== nodeName) return false; // stale event from an already-abandoned node

  const now = Date.now();
  failureTimestamps.push(now);
  failureTimestamps = failureTimestamps.filter((t) => now - t <= UNHEALTHY_WINDOW_MS);

  if (failureTimestamps.length < UNHEALTHY_FAILURE_COUNT) return false;

  console.warn(`[NODE] 🔁 "${nodeName}" failed ${UNHEALTHY_FAILURE_COUNT}x within ${UNHEALTHY_WINDOW_MS / 1000}s — failing over to the next node.`);
  abandonActiveNode(client);
  connectNext(client);
  return true;
}

/**
 * Call from the node 'disconnect' handler (Shoukaku's own reconnectTries
 * exhausted — it already gave up on this node and removed it from the pool
 * itself). Fails over immediately, no need to wait for the strike count.
 */
export function reportNodeGaveUp(client: any, nodeName: string): void {
  if (priorityList[activeIndex]?.name !== nodeName) return;
  console.warn(`[NODE] 🔁 "${nodeName}" exhausted its reconnect attempts — failing over to the next node.`);
  connectNext(client);
}

/** Name of the node the manager is currently targeting (connecting or connected), or null. */
export function getActiveNodeName(): string | null {
  return priorityList[activeIndex]?.name ?? null;
}

/** Full configured priority order, best node first. */
export function getPriorityOrder(): string[] {
  return priorityList.map((n) => n.name);
}
