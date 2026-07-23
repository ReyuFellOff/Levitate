// xoxo/config.ts
//
// Central runtime configuration for the bot.
//
// File layout (top → bottom):
//   1.  Bot identity       — token, clientId, prefix, language       (env-driven)
//   2.  Developers         — owner / co-owner list
//   3.  Display labels     — strings shown in the debug menu
//   4.  Notes channel      — `note` dev command target + divider
//   5.  Embed color        — fallback embed accent color
//   6.  Links              — public links (support server, etc.)
//   7.  Webhooks           — log-channel webhook URLs                 (env-driven)
//   8.  Default presence   — fallback presence when no botInstances
//                            entry matches the running clientId
//
// Per-bot status / presence config lives in `xoxo/config/botInstances.ts`.
// Hosting IP → display-name map lives in `xoxo/config/hostingServices.ts`.
// Debug-command tunables live in `xoxo/config/debugConfig.ts`.

import "dotenv/config";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface Config {
  // 1. Bot identity
  /** Display name of this bot — used everywhere instead of hardcoding. */
  botName: string;
  /** Discord bot token (from env). */
  botToken: string | undefined;
  /** Discord application / client ID (from env). */
  clientId: string | undefined;
  /** Default text-command prefix. */
  prefix: string;
  /** Programming language label shown in the debug menu. */
  language: string;

  // 2. Developers
  /** `[name, id][]` — first entry is treated as the MAIN developer. */
  developers: [string, string][];

  // 3. Display labels
  /**
   * Hosting service display override. When non-empty, this value is shown
   * as the hosting provider everywhere (debug menu, ready webhook, etc.)
   * and the IP-matching table in `xoxo/config/hostingServices.ts` is bypassed.
   * Set to "" to use automatic IP-based detection.
   */
  hardcodeHostingService: string;
  /**
   * Fallback hosting provider label. Used when `hardcodeHostingService` is
   * "" (empty) AND the fetched public IP doesn't match any entry in
   * `xoxo/config/hostingServices.ts`.
   */
  fallbackHostingService: string;
  /** Database provider label shown in the debug menu. */
  databaseProvider: string;

  // 4. Notes channel
  /** Channel ID where the dev-only `note` command posts notes. */
  notesChannelId: string;
  /** Plain-text divider message sent after every `note` post. */
  noteDivider: string;

  // 4b. Saved data channel
  /** Channel ID where the `create` command stores saved message/embed/cv2 payloads. */
  savedDataChannelId: string;
  /** Channel ID where $serverlist posts an embed per guild the bot is in. */
  serverListChannelId: string;
  /** Plain-text divider message sent after every saved-data post and every sticky-data upload. */
  dataDivider: string;
  /** Channel ID where deleted saved-data entries are logged. */
  deletedDataChannelId: string;
  /** Channel ID where sticky payload files are archived when a sticky is set. */
  stickyDataChannelId: string;
  /** Plain-text divider message sent after every sticky-data upload. */
  stickyDataDivider: string;

  // 5. Embed color
  /** Default embed accent color (hex). */
  embedColor: string;

  // 6. Links
  /** Public support server invite URL. */
  supportServer: string;
  /** Support server guild ID — its saved name style is used as the default for all other guilds. */
  supportServerId: string;

  // 7. Webhooks (env-driven; any may be undefined)
  webhooks: {
    readyLog: string | undefined;
    shardLog: string | undefined;
    joinLeave: string | undefined;
    errorLog: string | undefined;
    commandLog: string | undefined;
  };

  // 8. Music
  /**
   * Default Lavalink search prefix used when the user's query is plain text
   * (not a URL and not already prefixed).
   *   "ytsearch"  — YouTube
   *   "ytmsearch" — YouTube Music
   *   "scsearch"  — SoundCloud
   *   "spsearch"  — Spotify     (requires LavaSrc on the node)
   *   "dzsearch"  — Deezer      (requires LavaSrc on the node)
   */
  defaultSource: string;
  /** Lavalink node connection list. */
  nodes: Array<{
    host: string;
    port: number;
    name: string;
    auth: string;
    secure: boolean;
  }>;

  // 9. Default presence
  /**
   * Fallback presence — applied only when no entry in
   * `xoxo/config/botInstances.ts` matches the running clientId.
   */
  defaultPresence: {
    name: string;
    type: string;
    status: string;
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Bot name (named export — imported directly by many modules)
// ─────────────────────────────────────────────────────────────────────────────

export const botName = "Levitate";

// ─────────────────────────────────────────────────────────────────────────────
// Config
// ─────────────────────────────────────────────────────────────────────────────

export const config: Config = {
  // ── 1. Bot identity ────────────────────────────────────────────────────────
  botName,
  botToken: process.env["DISCORD_TOKEN"],
  clientId: process.env["DISCORD_CLIENT_ID"],
  prefix: "$",
  language: "TypeScript",

  // ── 2. Developers ──────────────────────────────────────────────────────────
  // The first entry is treated as the MAIN developer wherever needed.
  developers: [["Reyansh", "922491166149214218"]],

  // ── 3. Display labels ──────────────────────────────────────────────────────
  // Leave hardcodeHostingService as "" to fall back to IP-based detection
  // from xoxo/config/hostingServices.ts.
  hardcodeHostingService: "",
  // Shown when hardcodeHostingService is "" and the public IP doesn't match
  // any entry in xoxo/config/hostingServices.ts.
  fallbackHostingService: "Replit",
  databaseProvider: "MongoDB Atlas",

  // ── 4. Notes channel ───────────────────────────────────────────────────────
  notesChannelId: "1521510471276957837",
  noteDivider:
    "**. ݁₊ ⊹ . ݁ ⟡ ݁ . ⊹ ₊ ݁.. ݁₊ ⊹ . ݁ ⟡ ݁ . ⊹ ₊ ݁.. ݁₊ ⊹ . ݁ ⟡ ݁ . ⊹ ₊ ݁.**",

  // ── 4b. Saved data channel ─────────────────────────────────────────────────
  // Channel where $create stores message/embed/cv2 payloads as files.
  savedDataChannelId: "1520465483495641250",
  // Channel where $serverlist posts an embed per guild the bot is in.
  serverListChannelId: "1522111035228819597",
  dataDivider:
    "**︶︶₊˚꒷︶︶꒷꒦♡₊˚ ︶︶₊˚꒷︶︶꒷꒦♡₊˚ ︶︶₊˚꒷︶︶꒷꒦♡₊˚**",
  // Channel where deleted saved-data entries are logged.
  deletedDataChannelId: "1520495793268850760",
  // Channel where sticky payload files are stored when a sticky is set.
  stickyDataChannelId: "1521487031279157299",
  stickyDataDivider:
    "**︶︶₊˚꒷︶︶꒷꒦♡₊˚ ︶︶₊˚꒷︶︶꒷꒦♡₊˚ ︶︶₊˚꒷︶︶꒷꒦♡₊˚**",

  // ── 5. Embed color ─────────────────────────────────────────────────────────
  embedColor: "#b4f8c8",

  // ── 6. Links ───────────────────────────────────────────────────────────────
  supportServer: "https://discord.gg/YpCfcCTXdv",
  supportServerId: "1493286181885050961",

  // ── 7. Webhooks (from .env) ────────────────────────────────────────────────
  webhooks: {
    readyLog: process.env["READY_LOG_WEBHOOK_URL"],
    shardLog: process.env["SHARD_LOG_WEBHOOK_URL"],
    joinLeave: process.env["JOIN_LEAVE_WEBHOOK_URL"],
    errorLog: process.env["ERROR_LOG_WEBHOOK_URL"],
    commandLog: process.env["COMMAND_LOG_WEBHOOK_URL"],
  },

  // ── 8b. Music ──────────────────────────────────────────────────────────────
  defaultSource: 'ytmsearch',
  nodes: [
    {
      host:   'lavalinkv4.serenetia.com',
      port:   443,
      name:   'Serenetia',
      auth:   'https://seretia.link/discord',
      secure: true,
    },
    {
      host:   'lavalink.jirayu.net',
      port:   13592,
      name:   'Jirayu',
      auth:   'youshallnotpass',
      secure: false,
    },
    {
      host:   '89.106.84.59',
      port:   4000,
      name:   'HeavenCloud',
      auth:   'heavencloud.in',
      secure: false,
    },
  ],

  // ── 8. Default presence ────────────────────────────────────────────────────
  // Fallback only — used when no botInstances.ts entry matches the running
  // clientId. Per-bot presences are defined in xoxo/config/botInstances.ts.
  defaultPresence: {
    name: "/help | {guilds} Guilds",
    type: "Listening",
    status: "idle",
  },
};

export default config;
