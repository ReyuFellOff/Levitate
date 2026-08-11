// xoxo/handlers/commandRegister.ts
//
// Reads every `data` export (SlashCommandBuilder) from
// `dist/xoxo/slashCommands/**/*.js` and registers them with Discord globally
// via REST PUT /applications/:id/commands.
//
// This is intentionally separate from slashLoader.ts:
//   • slashLoader  — maps command names → execute functions (in-memory)
//   • commandRegister — pushes builders to Discord's API (network call)
//
// Slash builder file contract (in `xoxo/slashCommands/<category>/foo.ts`):
//   export const data = new SlashCommandBuilder()
//     .setName('foo')
//     .setDescription('Does foo things.');

import { readdirSync } from 'fs';
import { join }        from 'path';
import { pathToFileURL } from 'url';
import { REST, Routes }  from 'discord.js';
import type { LevitateClient } from '../structures/LevitateClient.js';

// Discord permits at most 100 top-level global chat-input commands per
// application. These low-value informational commands remain available via
// prefix commands, but are intentionally not registered globally so every
// moderation, music, security, and utility slash command can fit.
const PREFIX_ONLY_SLASH_COMMANDS = new Set([
  'placeholder-help',
  'developer',
  'invite',
  'uptime',
  // Keep the global command payload below Discord's 100-command limit.
  // These low-priority rating commands remain available as prefix commands.
  'howautistic',
  'howcute',
  'howgay',
  'howsimp',
]);

// ── Public API ───────────────────────────────────────────────────────────────

export async function registerSlashCommands(client: LevitateClient): Promise<void> {
  const token    = client.config.botToken;
  const clientId = client.config.clientId;

  if (!token || !clientId) {
    console.warn('[SLASH REG] Missing DISCORD_TOKEN or DISCORD_CLIENT_ID — skipping registration.');
    return;
  }

  const dir      = join(process.cwd(), 'dist', 'xoxo', 'slashCommands');
  const builders: any[] = [];

  try {
    await collectBuilders(dir, builders);
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      console.warn('[SLASH REG] slashCommands directory not found — skipping.');
      return;
    }
    throw err;
  }

  if (builders.length === 0) {
    console.info('[SLASH REG] No slash command builders found.');
    return;
  }

  const rest = new REST({ version: '10' }).setToken(token);

  try {
    await rest.put(Routes.applicationCommands(clientId), {
      body: builders.map((b) => {
        const json = b.toJSON() as Record<string, any>;
        // If the builder didn't call setIntegrationTypes(), Discord (for apps
        // with user-install enabled) may surface the command to user-install
        // users in every server, even ones the bot isn't in.  Stamp it
        // explicitly as GuildInstall-only (0) so it only appears where the bot
        // is a guild member.
        if (!Array.isArray(json.integration_types)) {
          json.integration_types = [0];
          json.contexts          = [0]; // Guild context only
        }
        return json;
      }),
    });
    console.log(`[SLASH REG] Registered ${builders.length} slash command(s) globally.`);
    (client as any).slashCommandsSynced = true;
  } catch (err: unknown) {
    console.error('[SLASH REG] Failed to register slash commands with Discord:', err);
  }
}

// ── Internals ────────────────────────────────────────────────────────────────

async function collectBuilders(dir: string, builders: any[]): Promise<void> {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);

    if (entry.isDirectory()) {
      await collectBuilders(full, builders);
      continue;
    }

    if (!entry.name.endsWith('.js')) continue;

    try {
      const raw  = await import(pathToFileURL(full).href);
      // Support both: `export const data = ...` and `export default { data }`
      const exported = raw.data ?? raw.default?.data;
      const dataList = Array.isArray(exported) ? exported : [exported];

      for (const data of dataList) {
        if (!data || typeof data.toJSON !== 'function') continue;
        const name = data.toJSON()?.name;
        if (PREFIX_ONLY_SLASH_COMMANDS.has(name)) {
          console.info(`[SLASH REG] Keeping /${name} prefix-only to stay within Discord's 100-command limit.`);
          continue;
        }
        builders.push(data);
      }
    } catch (err: unknown) {
      console.error(`[SLASH REG] Failed to read builder from ${entry.name}:`, err);
    }
  }
}
