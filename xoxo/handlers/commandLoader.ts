// xoxo/handlers/commandLoader.ts
//
// Scans `dist/xoxo/commands/**/*.js` recursively and loads every file that
// exports a `prefixExecute` function into `client.commands`. Aliases are
// registered into `client.aliases` at the same time.
//
// Command file contract:
//   export const options: CommandOptions = { name, description, category, usage, ... };
//   export async function prefixExecute(message, args, client) { ... }

import { readdirSync } from 'fs';
import { join }        from 'path';
import { pathToFileURL } from 'url';
import type { LevitateClient } from '../structures/LevitateClient.js';

// ── Types ────────────────────────────────────────────────────────────────────

export interface CommandOptions {
  name:        string;
  description: string;
  category:    string;
  usage:       string;
  aliases?:    string[];
  /** Restrict to bot developers only. */
  owner?:      boolean;
  userPerms?:  string[];
  botPerms?:   string[];
  /** Per-user cooldown in seconds. */
  cooldown?:   number;
}

interface PrefixCommandModule {
  options:       CommandOptions;
  prefixExecute: (message: any, args: string[], client: LevitateClient) => Promise<void> | void;
}

interface LoadStats { loaded: number; devLoaded: number; skipped: number; }

// ── Public API ───────────────────────────────────────────────────────────────

export async function loadPrefixCommands(client: LevitateClient): Promise<void> {
  const dir   = join(process.cwd(), 'dist', 'xoxo', 'commands');
  const stats = { loaded: 0, devLoaded: 0, skipped: 0 } satisfies LoadStats;

  try {
    await scanDir(client, dir, stats);
    console.log(`[COMMANDS LOADER] Loaded ${stats.loaded} prefix command(s) (${stats.skipped} skipped)`);
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
      console.error('[COMMANDS LOADER] Error during load:', err);
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
      const modules: Partial<PrefixCommandModule>[] = Array.isArray(exported.commands)
        ? exported.commands
        : [exported];

      for (const mod of modules) {
        if (typeof mod.prefixExecute !== 'function') {
          stats.skipped++;
          continue;
        }

        const opts = mod.options;
        if (!opts?.name || !opts.category || opts.usage === undefined) {
          console.warn(`[COMMANDS LOADER] Skipping ${entry.name}: missing required options fields`);
          stats.skipped++;
          continue;
        }

        const name = opts.name.toLowerCase();
        client.commands.set(name, mod);
        for (const alias of opts.aliases ?? []) client.aliases.set(alias.toLowerCase(), name);
        stats.loaded++;
      }
    } catch (err: unknown) {
      console.error(`[COMMANDS LOADER] Failed to load ${entry.name}:`, err);
      stats.skipped++;
    }
  }
}
