// xoxo/helpers/statsServer.ts
//
// Lightweight HTTP server that exposes live bot statistics as JSON.
// The Cassie website polls GET /api/stats to display real-time data.
//
// Only started on cluster 0 — other clusters would conflict on the same port.
// If this cluster aggregates via broadcastEval the global numbers are correct.
//
// Required env var:
//   STATS_API_PORT    — port to listen on (default: 3001)
//
// Optional env var:
//   STATS_API_SECRET  — if set, callers must send:
//                       Authorization: Bearer <secret>
//
// CORS: allows all origins so the Vercel site can call it without a proxy.

import { createServer } from 'http';
import type { IncomingMessage, ServerResponse } from 'http';
import type { CassieClient } from '../structures/CassieClient.js';

// ── Stat gatherer ────────────────────────────────────────────────────────────

async function gatherStats(client: CassieClient): Promise<Record<string, unknown>> {
  const cluster = (client as any).cluster;

  // Per-cluster baseline (used as fallback if broadcastEval fails)
  let servers  = client.guilds?.cache?.size ?? 0;
  let users    = client.guilds?.cache?.reduce((s: number, g: any) => s + (g.memberCount ?? 0), 0) ?? 0;
  let channels = client.guilds?.cache?.reduce((s: number, g: any) => s + (g.channels?.cache?.size ?? 0), 0) ?? 0;

  // Aggregate across all clusters/shards
  if (cluster?.broadcastEval) {
    const [srv, usr, ch] = await Promise.all([
      cluster
        .broadcastEval((c: any) => c.guilds.cache.size)
        .then((r: number[]) => r.reduce((a: number, b: number) => a + b, 0))
        .catch((): number => servers),
      cluster
        .broadcastEval((c: any) =>
          c.guilds.cache.reduce((s: number, g: any) => s + (g.memberCount ?? 0), 0),
        )
        .then((r: number[]) => r.reduce((a: number, b: number) => a + b, 0))
        .catch((): number => users),
      cluster
        .broadcastEval((c: any) =>
          c.guilds.cache.reduce((s: number, g: any) => s + (g.channels?.cache?.size ?? 0), 0),
        )
        .then((r: number[]) => r.reduce((a: number, b: number) => a + b, 0))
        .catch((): number => channels),
    ]);
    servers  = srv;
    users    = usr;
    channels = ch;
  }

  const commandsExecuted: number =
    (await (client.db as any)?.getGlobalCommandsExecuted?.().catch((): number => 0)) ?? 0;

  const mem      = process.memoryUsage();
  const ping     = client.ws?.ping ?? -1;
  const shards   = (cluster as any)?.info?.TOTAL_SHARDS ?? client.ws?.shards?.size ?? 1;
  const clusters = (cluster as any)?.count ?? 1;

  return {
    status:           'online',
    servers,
    users,
    channels,
    uptimeSecs:       Math.floor(process.uptime()),
    commandsExecuted,
    ping,
    memoryMB:         Math.round(mem.rss / 1024 / 1024),
    shards,
    clusters,
    timestamp:        Date.now(),
  };
}

// ── Server ───────────────────────────────────────────────────────────────────

export function startStatsServer(client: CassieClient): void {
  const port   = parseInt(process.env['STATS_API_PORT'] ?? '3001', 10);
  const secret = process.env['STATS_API_SECRET'] ?? '';

  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    res.setHeader('Access-Control-Allow-Origin',  '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    const url = req.url?.split('?')[0];

    if (url !== '/api/stats') {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not found' }));
      return;
    }

    if (secret) {
      const auth = (req.headers['authorization'] as string | undefined) ?? '';
      if (auth !== `Bearer ${secret}`) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Unauthorized' }));
        return;
      }
    }

    try {
      const stats = await gatherStats(client);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(stats));
    } catch (err: unknown) {
      console.error(`[STATS SERVER] Error: ${(err as Error).message}`);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Internal error' }));
    }
  });

  server.listen(port, () => {
    console.log(`[STATS SERVER] 📊 Stats API listening on port ${port} — GET /api/stats`);
  });

  server.on('error', (err: Error) => {
    console.error(`[STATS SERVER] Error: ${err.message}`);
  });
}
