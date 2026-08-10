// xoxo/handlers/eventLoader.ts
//
// Scans `dist/xoxo/events/**/*.js` recursively and registers every event file.
// Events are organised into subdirectories — the loader inspects the optional
// `type` export to decide where to attach:
//
//   type === 'player'  → client.kazagumo  (Kazagumo player events)
//   type === 'node'    → client.kazagumo.shoukaku  (Shoukaku node events)
//   (else / omitted)  → client  (Discord.js events, default)
//
// Event file contract:
//   export const name: string = 'messageCreate';
//   export const type?: string;           // 'player' | 'node' | 'discord' | undefined
//   export const once?: boolean;          // optional, defaults to false
//   export async function execute(...args) { ... }

import { readdirSync } from 'fs';
import { join }        from 'path';
import { pathToFileURL } from 'url';
import type { LevitateClient } from '../structures/LevitateClient.js';

// ── Types ────────────────────────────────────────────────────────────────────

interface EventModule {
  name:     string;
  type?:    string;
  once?:    boolean;
  execute:  (...args: any[]) => Promise<void> | void;
}

// ── Public API ───────────────────────────────────────────────────────────────

export async function loadAllEvents(client: LevitateClient): Promise<void> {
  const dir = join(process.cwd(), 'dist', 'xoxo', 'events');
  let loaded = 0;

  try {
    await scanDir(client, dir, () => loaded++);
    console.log(`[EVENT LOADER] Loaded ${loaded} event(s)`);
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
      console.error('[EVENT LOADER] Error during load:', err);
    }
  }
}

// ── Internals ────────────────────────────────────────────────────────────────

async function scanDir(
  client:  LevitateClient,
  dir:     string,
  onLoad:  () => void,
): Promise<void> {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);

    if (entry.isDirectory()) {
      await scanDir(client, full, onLoad);
      continue;
    }

    if (!entry.name.endsWith('.js')) continue;

    try {
      const raw   = await import(pathToFileURL(full).href);
      const event = (raw.default ?? raw) as Partial<EventModule>;

      if (!event.name || typeof event.execute !== 'function') {
        console.warn(`[EVENT LOADER] Skipping ${entry.name}: missing name or execute`);
        continue;
      }

      const emitter = resolveEmitter(client, event.type);
      if (!emitter) {
        // Kazagumo not yet initialized — skip player/node events gracefully
        console.warn(`[EVENT LOADER] Skipping ${entry.name}: emitter not ready (type=${event.type})`);
        continue;
      }

      // Player and node events receive client as the FIRST argument (execute(client, ...args)).
      // Discord events receive client as the LAST argument (execute(...args, client)).
      // This matches the convention used in all event files.
      const isPlayerOrNode = event.type === 'player' || event.type === 'node';
      const handler = isPlayerOrNode
        ? (...args: any[]) => event.execute!(client, ...args)
        : (...args: any[]) => event.execute!(...args, client);

      if (event.once) {
        emitter.once(event.name, handler);
      } else {
        emitter.on(event.name, handler);
      }

      onLoad();
    } catch (err: unknown) {
      console.error(`[EVENT LOADER] Failed to load ${entry.name}:`, err);
    }
  }
}

function resolveEmitter(client: LevitateClient, type?: string): any {
  if (type === 'player') {
    return (client as any).kazagumo ?? null;
  }
  if (type === 'node') {
    return (client as any).kazagumo?.shoukaku ?? null;
  }
  // 'discord', undefined, or any other value → attach to the Discord client
  return client;
}
