// xoxo/handlers/eventLoader.ts
//
// Scans `dist/xoxo/events/**/*.js` recursively and registers every event file
// on the client. Events are organised into subdirectories (e.g. `discord/`,
// `shard/`) — the loader doesn't care about folder structure, only the file's
// exported shape.
//
// Event file contract:
//   export const name: string = 'messageCreate';
//   export const once: boolean = false;   // optional, defaults to false
//   export async function execute(...args) { ... }

import { readdirSync } from 'fs';
import { join }        from 'path';
import { pathToFileURL } from 'url';
import type { LevitateClient } from '../structures/LevitateClient.js';

// ── Types ────────────────────────────────────────────────────────────────────

interface EventModule {
  name:     string;
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

      if (event.once) {
        client.once(event.name, (...args) => event.execute!(...args, client));
      } else {
        client.on(event.name, (...args) => event.execute!(...args, client));
      }

      onLoad();
    } catch (err: unknown) {
      console.error(`[EVENT LOADER] Failed to load ${entry.name}:`, err);
    }
  }
}
