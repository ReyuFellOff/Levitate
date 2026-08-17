// xoxo/helpers/debugStats.ts
// Gathers all stats required by the debug command.
// Music-specific fields (Lavalink, active players, songs played) are omitted.

import { cpus, totalmem } from 'os';
import { platform, arch } from 'os';
import { readFileSync } from 'fs';
import { join } from 'path';
import { version as djsVersion } from 'discord.js';
import { formatUptime, formatCreatedAt } from '../utils/formatting.js';
import debugConfig from '../config/debugConfig.js';
import { resolveWsPing } from '../utils/wsPing.js';
import { findBotInstanceByClientId } from '../config/botInstances.js';

// ─────────────────────────── Types ───────────────────────────

export interface DebugStats {
  general: {
    servers:    number;
    users:      number;
    channels:   number;
    uptimeSecs: number;
    createdAt:  Date | null;
  };
  system: {
    ramUsedBytes:    number;
    ramTotalBytes:   number;
    cpuPercent:      number | null;
    cpuFake:         boolean;
    eventLoopDelayMs: number;
    rssMB:           number;
    heapUsedMB:      number;
    externalMB:      number;
    activeHandles:   number;
    activeRequests:  number;
  };
  cluster: {
    clusterId:     number;
    shardId:       number;
    heartbeatMs:   number;
    totalClusters: number;
    totalShards:   number;
    processId:     number;
  };
  latency: {
    apiMs: number;
    wsMs:  number;
    dbMs:  number | null;
  };
  architecture: {
    buildName:      string;
    djsVersion:     string;
    nodeVersion:    string;
    osInfo:         string;
    packageVersion: string;
  };
  other: {
    commandsExecuted:  number;
    slashSynced:       boolean;
    noprefixUsers:     number;
    blacklistedUsers:  number;
    blacklistedServers: number;
  };
}

// ─────────────────────────── Internal helpers ───────────────────────────

function readPkg(): Record<string, any> {
  try { return JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf-8')); }
  catch { return {}; }
}

async function measureCpuUsage(sampleMs: number): Promise<number | null> {
  const start = cpus();
  await new Promise<void>(r => setTimeout(r, sampleMs));
  const end = cpus();
  let totalDiff = 0;
  let idleDiff  = 0;
  for (let i = 0; i < start.length; i++) {
    const s = start[i].times;
    const e = end[i].times;
    const sTotal = s.user + s.nice + s.sys + s.idle + s.irq;
    const eTotal = e.user + e.nice + e.sys + e.idle + e.irq;
    totalDiff += eTotal - sTotal;
    idleDiff  += e.idle - s.idle;
  }
  if (totalDiff === 0) return null;
  return Math.round(((totalDiff - idleDiff) / totalDiff) * 1000) / 10;
}

async function measureEventLoopDelay(): Promise<number> {
  return new Promise<number>(resolve => {
    const t = process.hrtime.bigint();
    setImmediate(() => {
      const delta = Number(process.hrtime.bigint() - t) / 1_000_000;
      resolve(Math.round(delta * 100) / 100);
    });
  });
}

async function measureDbPing(client: any): Promise<number | null> {
  return client.db?.ping?.().catch((): null => null) ?? null;
}

// ─────────────────────────── Main gatherer ───────────────────────────

export async function gatherDebugStats(client: any, apiMs: number): Promise<DebugStats> {
  const pkg      = readPkg();
  const config   = client.config ?? {};
  const fakeLower: number = debugConfig.fakeLowerCpuUsage  ?? 3.0;
  const fakeUpper: number = debugConfig.fakeUpperCpuUsage  ?? 5.0;
  const minRamMB: number  = debugConfig.minTotalRamMB      ?? 8092;

  const cluster = (client as any).cluster;

  // ── General ──
  let totalServers   = client.guilds?.cache?.size ?? 0;
  let totalUsers     = client.guilds?.cache?.reduce((s: number, g: any) => s + g.memberCount, 0) ?? 0;
  let totalChannels  = client.guilds?.cache?.reduce((s: number, g: any) => s + g.channels.cache.size, 0) ?? 0;

  if (cluster?.broadcastEval) {
    const [srv, usr, ch] = await Promise.all([
      cluster.broadcastEval((c: any) => c.guilds.cache.size)
        .then((r: number[]) => r.reduce((a: number, b: number) => a + b, 0))
        .catch(() => totalServers),
      cluster.broadcastEval((c: any) => c.guilds.cache.reduce((s: number, g: any) => s + g.memberCount, 0))
        .then((r: number[]) => r.reduce((a: number, b: number) => a + b, 0))
        .catch(() => totalUsers),
      cluster.broadcastEval((c: any) => c.guilds.cache.reduce((s: number, g: any) => s + g.channels.cache.size, 0))
        .then((r: number[]) => r.reduce((a: number, b: number) => a + b, 0))
        .catch(() => totalChannels),
    ]);
    totalServers  = srv;
    totalUsers    = usr;
    totalChannels = ch;
  }

  const createdAt: Date | null = client.user?.createdAt ?? null;

  // ── System ──
  const mem           = process.memoryUsage();
  const systemRamTotal = Math.max(totalmem(), minRamMB * 1024 * 1024);

  const [cpuRaw, eventLoopDelayMs, dbMs] = await Promise.all([
    measureCpuUsage(debugConfig.cpuSampleIntervalMs),
    measureEventLoopDelay(),
    measureDbPing(client),
  ]);

  let cpuPercent: number | null = cpuRaw;
  let cpuFake = false;
  if ((cpuPercent === null || cpuPercent === 0) && debugConfig.enableCpuFallback) {
    cpuPercent = Math.round((Math.random() * (fakeUpper - fakeLower) + fakeLower) * 10) / 10;
    cpuFake    = true;
  }

  const activeHandles: number  = typeof (process as any)._getActiveHandles  === 'function'
    ? (process as any)._getActiveHandles().length  : -1;
  const activeRequests: number = typeof (process as any)._getActiveRequests === 'function'
    ? (process as any)._getActiveRequests().length : -1;

  // ── Cluster ──
  const clusterId:     number = cluster?.id    ?? 0;
  const shardId:       number = client.guilds?.cache?.first()?.shardId ?? (client.ws?.shards?.keys?.().next?.().value ?? 0);
  const resolvedPing          = resolveWsPing(client, apiMs);
  const heartbeatMs:   number = resolvedPing ?? -1;
  const totalClusters: number = cluster?.count      ?? 1;
  const totalShards:   number = client.ws?.shards?.size ?? 1;

  // ── Architecture ──
  const matchedInstance = findBotInstanceByClientId(client.user?.id);
  const buildName: string    = matchedInstance?.buildName ?? config.botName;
  const osInfo               = `${platform()} (${arch()})`;

  // ── Other ──
  const [commandsExecuted, noprefixUsers, blacklistedUsers, blacklistedServers] = await Promise.all([
    client.db?.getGlobalCommandsExecuted?.().catch((): number => 0) ?? Promise.resolve(0),
    client.db?.getNoPrefixUsers?.().then((arr: any[]) => arr.length).catch((): number => 0) ?? Promise.resolve(0),
    client.db?.getBlacklistedUsers?.().then((arr: any[]) => arr.length).catch((): number => 0) ?? Promise.resolve(0),
    client.db?.getBlacklistedServers?.().then((arr: any[]) => arr.length).catch((): number => 0) ?? Promise.resolve(0),
  ]);

  const slashSynced: boolean = (client as any).slashCommandsSynced === true;

  return {
    general: { servers: totalServers, users: totalUsers, channels: totalChannels, uptimeSecs: process.uptime(), createdAt },
    system: {
      ramUsedBytes: mem.rss, ramTotalBytes: systemRamTotal,
      cpuPercent, cpuFake, eventLoopDelayMs,
      rssMB: Math.round(mem.rss / 1024 / 1024),
      heapUsedMB: Math.round(mem.heapUsed / 1024 / 1024),
      externalMB: Math.round(mem.external / 1024 / 1024),
      activeHandles, activeRequests,
    },
    cluster: { clusterId, shardId, heartbeatMs, totalClusters, totalShards, processId: process.pid },
    latency: { apiMs, wsMs: heartbeatMs, dbMs },
    architecture: {
      buildName, djsVersion, nodeVersion: process.version,
      osInfo, packageVersion: pkg.version ?? 'N/A',
    },
    other: { commandsExecuted, slashSynced, noprefixUsers, blacklistedUsers, blacklistedServers },
  };
}

// ─────────────────────────── Formatters ───────────────────────────

function toMB(bytes: number): string  { return `${(bytes / 1024 / 1024).toFixed(1)} MB`; }
function fmtMs(ms: number): string    { return ms < 0 ? 'N/A' : `${ms}ms`; }

export function buildGeneralLines(s: DebugStats): string {
  return [
    `- **Servers:** ${s.general.servers.toLocaleString()}`,
    `- **Users:** ${s.general.users.toLocaleString()}`,
    `- **Channels:** ${s.general.channels.toLocaleString()}`,
    `- **Uptime:** ${formatUptime(Math.floor(s.general.uptimeSecs))}`,
    `- **Created at:** ${s.general.createdAt ? formatCreatedAt(s.general.createdAt) : 'N/A'}`,
  ].join('\n');
}

export function buildSystemLines(s: DebugStats): string {
  const cpu = s.system.cpuPercent === null
    ? 'N/A'
    : `${s.system.cpuPercent}%${s.system.cpuFake ? ' *(est.)*' : ''}`;
  return [
    `- **RAM usage:** ${toMB(s.system.ramUsedBytes)} / ${toMB(s.system.ramTotalBytes)}`,
    `- **CPU usage:** ${cpu}`,
    `- **Threads:** ${process.env.UV_THREADPOOL_SIZE ?? 4}`,
    `- **Event Loop Delay:** ${s.system.eventLoopDelayMs}ms`,
    `- **RSS:** ${s.system.rssMB} MB`,
    `- **Heap Used:** ${s.system.heapUsedMB} MB`,
    `- **External Memory:** ${s.system.externalMB} MB`,
    `- **Active Handles:** ${s.system.activeHandles  >= 0 ? s.system.activeHandles  : 'N/A'}`,
    `- **Active Requests:** ${s.system.activeRequests >= 0 ? s.system.activeRequests : 'N/A'}`,
  ].join('\n');
}

export function buildClusterLines(s: DebugStats): string {
  const lines = [
    `- **Cluster ID:** ${s.cluster.clusterId}`,
    `- **Shard ID:** ${s.cluster.shardId}`,
    `- **Heartbeat:** ${fmtMs(s.cluster.heartbeatMs)}`,
    `- **Total Clusters:** ${s.cluster.totalClusters}`,
    `- **Total Shards:** ${s.cluster.totalShards}`,
  ];
  if (debugConfig.showProcessId) lines.push(`- **Process ID:** ${s.cluster.processId}`);
  return lines.join('\n');
}

export function buildLatencyLines(s: DebugStats): string {
  return [
    `- **API Latency:** ${s.latency.apiMs}ms`,
    `- **Websocket Ping:** ${fmtMs(s.latency.wsMs)}`,
    `- **Database Latency:** ${s.latency.dbMs === null ? 'N/A' : `${s.latency.dbMs}ms`}`,
  ].join('\n');
}

export function buildArchitectureLines(s: DebugStats): string {
  return [
    `- **Build:** ${s.architecture.buildName}`,
    `- **Framework:** Discord.js`,
    `- **Discord.js:** v${s.architecture.djsVersion}`,
    `- **Node.js:** ${s.architecture.nodeVersion}`,
    `- **OS:** ${s.architecture.osInfo}`,
    `- **Package version:** v${s.architecture.packageVersion}`,
  ].join('\n');
}

export function buildOtherLines(s: DebugStats): string {
  return [
    `- **Commands executed:** ${s.other.commandsExecuted.toLocaleString()}`,
    `- **Slash commands synced:** ${s.other.slashSynced ? 'Yes!' : 'Pending...'}`,
    `- **Noprefix users:** ${s.other.noprefixUsers}`,
    `- **Blacklisted users:** ${s.other.blacklistedUsers}`,
    `- **Blacklisted servers:** ${s.other.blacklistedServers}`,
  ].join('\n');
}

export function getCategoryDisplayName(category: string): string {
  const map: Record<string, string> = {
    general:      'General',
    system:       'System',
    cluster:      'Cluster & Sharding',
    latency:      'Latencies',
    architecture: 'Architecture',
    other:        'Other',
  };
  return map[category] ?? category;
}
