// xoxo/handlers/slashLoader.ts
//
// Scans `dist/dior/commands/**/*.js` recursively and loads every file that
// exports a `slashExecute` function into `client.slashCommands`.
//
// A single command file can export BOTH `prefixExecute` and `slashExecute` —
// commandLoader and slashLoader each pick up their respective handler from the
// same file, so there is no duplication of logic.
//
// Slash command builder (data) registration is handled separately by
// `commandRegister.ts`, which scans `dist/dior/slashCommands/`.

import { readdirSync } from 'fs';
import { join }        from 'path';
import { pathToFileURL } from 'url';
import type { LevitateClient } from '../structures/LevitateClient.js';

// ── Types ────────────────────────────────────────────────────────────────────

interface SlashCommandModule {
  options:      { name: string; category: string; description: string; usage: string };
  slashExecute: (interaction: any, client: LevitateClient) => Promise<void> | void;
}

interface LoadStats { loaded: number; devLoaded: number; skipped: number; }

// ── Public API ───────────────────────────────────────────────────────────────

export async function loadSlashCommands(client: LevitateClient): Promise<void> {
  const dir   = join(process.cwd(), 'dist', 'dior', 'commands');
  const stats = { loaded: 0, devLoaded: 0, skipped: 0 } satisfies LoadStats;

  try {
    await scanDir(client, dir, stats);
    console.log(`[SLASH LOADER] Loaded ${stats.loaded} slash command(s) (${stats.skipped} skipped)`);
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
      console.error('[SLASH LOADER] Error during load:', err);
    }
  }
}

// ── Internals ────────────────────────────────────────────────────────────────

async function scanDir(client: LevitateClient, dir: string, stats: LoadStats): Promise<void> {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);

    if (entry.isDirectory()) {
      await scanDir(client, full, stats);
      continue;
    }

    if (!entry.name.endsWith('.js')) continue;

    try {
      const raw = await import(pathToFileURL(full).href);
      const exported = (raw.default ?? raw) as any;
      const modules: Partial<SlashCommandModule>[] = Array.isArray(exported.commands)
        ? exported.commands
        : [exported];

      for (const mod of modules) {
        if (typeof mod.slashExecute !== 'function') {
          stats.skipped++;
          continue;
        }

        const name = mod.options?.name?.toLowerCase();
        if (!name) {
          console.warn(`[SLASH LOADER] Skipping ${entry.name}: no name in options`);
          stats.skipped++;
          continue;
        }

        client.slashCommands.set(name, mod);
        stats.loaded++;
      }
    } catch (err: unknown) {
      console.error(`[SLASH LOADER] Failed to load ${entry.name}:`, err);
      stats.skipped++;
    }
  }
}
