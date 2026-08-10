// index.ts — top-level cluster manager
//
// Spawns clusters via discord-hybrid-sharding. Each cluster process runs
// `xoxo/levitate.ts` which handles login, loaders, and the full bot bootstrap.
//
// discord-hybrid-sharding sits above discord.js's built-in ShardingManager:
//   • Clusters  → OS-level processes (one per CPU core by default)
//   • Shards    → Discord gateway connections (distributed across clusters)
// This gives process-level isolation and CPU utilisation on top of gateway
// sharding, making it the recommended approach for any serious bot.

import 'dotenv/config';
import { ClusterManager } from 'discord-hybrid-sharding';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync, unlinkSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);

// ── Intentional-stop guard ──────────────────────────────────────────────────
// Some hosts (Pterodactyl-based panels like Nex Cloud/Wispbyte/Aerox Devs)
// run a crash-detection watchdog that auto-restarts the container on ANY
// process exit it didn't itself trigger via the panel's "Stop" action —
// `process.exit(0)` from `$stop-bot` looks identical to a crash to that
// watchdog, so it respawns the whole process instead of staying down.
//
// `$stop-bot` drops STOP_FLAG_PATH right before exiting. If the watchdog
// force-restarts us anyway, we see the flag here, remove it, and exit
// immediately without spawning any clusters or touching Discord — so the
// bot at least stays offline instead of fully coming back online.
const STOP_FLAG_PATH = join(__dirname, '.stop-flag');
if (existsSync(STOP_FLAG_PATH)) {
  unlinkSync(STOP_FLAG_PATH);
  console.log('[CLUSTER] Intentional-stop flag found — exiting without spawning clusters.');
  process.exit(0);
}

const token = process.env['DISCORD_TOKEN'];
if (!token) {
  console.error('[CLUSTER] DISCORD_TOKEN is not set. Exiting.');
  process.exit(1);
}

const manager = new ClusterManager(join(__dirname, 'xoxo', 'levitate.js'), {
  token,
  totalShards:       'auto',
  shardsPerClusters: 2,
  totalClusters:     'auto',
  mode:              'process',
  respawn:           true,
  // A flaky host network (e.g. gateway 503s during a bad night) can burn
  // through a tight restart budget fast, permanently stopping respawns
  // right when they're needed most. Give it more headroom.
  restarts: { interval: 30 * 60_000, max: 10 },
});

manager.on('clusterCreate', (cluster) => {
  const shardList: number[] = (cluster as any).shardList ?? [];
  const shardLabel =
    shardList.length === 0 ? '?'
    : shardList.length === 1 ? `shard ${shardList[0]}`
    : `shards ${shardList.join(', ')}`;
  console.log(`[CLUSTER] #${cluster.id} created — manages ${shardLabel}`);
});

manager.on('clusterError', (_cluster, error) => {
  console.error(`[CLUSTER] #${_cluster.id} error: ${error.message}`);
});

manager.on('clusterExit', (_cluster, code, signal) => {
  console.warn(`[CLUSTER] #${_cluster.id} exited | code: ${code} | signal: ${signal}`);
});

// ── Pre-flight gateway check ─────────────────────────────────────────────────
// Hits /gateway/bot before spawning so we surface bad tokens or rate-limits
// immediately rather than letting cluster processes crash silently.

async function preflightCheck(botToken: string): Promise<void> {
  let res: Response;
  try {
    res = await fetch('https://discord.com/api/v10/gateway/bot', {
      headers: { Authorization: `Bot ${botToken}` },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[CLUSTER] Pre-flight skipped (network error: ${msg}). Continuing.`);
    return;
  }

  if (res.ok) return;

  const status   = res.status;
  const bodyText = await res.text().catch((): string => '');

  if (status === 401) {
    console.error('[CLUSTER] DISCORD_TOKEN is invalid (401). Fix your environment variables.');
  } else if (status === 429) {
    console.error(`[CLUSTER] Rate-limited at /gateway/bot (429). Stop restarting and wait. Body: ${bodyText.slice(0, 200)}`);
  } else {
    console.error(`[CLUSTER] Pre-flight failed: HTTP ${status}. Body: ${bodyText.slice(0, 200)}`);
  }

  process.exit(1);
}

await preflightCheck(token);

manager.spawn({ timeout: -1 }).catch((err: Error) => {
  console.error('[CLUSTER] Failed to spawn clusters:', err.message);
  process.exit(1);
});
