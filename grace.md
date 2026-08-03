# Levitate — Project Bible (`grace.md`)

> **Last updated:** 2026-08-03 (website About connect panel: Discord identity and Add friend CTA are now separate, preventing the action from crowding the profile row; URL synchronized with `xoxo/config/developerPanel.ts`; website developer avatar decoration: static `developerConfig.avatar` takes priority over the Discord API avatar; decoration multiplier is tunable in `Levitate-Web/src/pages/About.tsx`; removed the separate avatar ring so the decoration hugs the avatar directly; invite: brownishSparkles header, visible divider separators, whiteArrow emoji on invite link; nick: guild-owner check added — returns specific error instead of misleading "higher role" message; customise: Profile button now opens a single unified "Edit Profile" modal with Name + Bio text inputs + Avatar + Banner file upload components (LabelBuilder + FileUploadBuilder) — no sub-panel step; Display Name placeholder shows current server nickname if one is set; successful apply now shows a success page (accent color, blacktick message, bot avatar thumbnail) with a grey "Customise" button that returns to the customise home page; submit with nothing provided still returns directly to home; Reset confirm "Cancel" renamed "← Back"; namestyle: replaced multi-step wizard with single-page form — font/effect/color preset dropdowns + custom-hex modal, pre-populated from DB; $namestyle command opens form directly)
> This document is the exhaustive reference for the Levitate Discord bot codebase. It covers every layer: architecture, startup, structures, loaders, events, commands, components, helpers, utilities, configuration, and database. Read it before touching anything. Keep it updated whenever you make a non-trivial change.

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Tech Stack](#2-tech-stack)
3. [Repository Layout](#3-repository-layout)
4. [Environment Variables / Secrets](#4-environment-variables--secrets)
5. [Configuration](#5-configuration)
6. [Bot Instances & Status](#6-bot-instances--status)
7. [Entry Point — `index.ts`](#7-entry-point--indexts)
8. [Per-Cluster Bootstrap — `xoxo/levitate.ts`](#8-per-cluster-bootstrap--xoxolevitatets)
9. [Client Structure — `LevitateClient`](#9-client-structure--levitateclient)
10. [Status Manager](#10-status-manager)
11. [Loaders](#11-loaders)
12. [Events](#12-events)
13. [Commands](#13-commands)
14. [Components V2 UI System](#14-components-v2-ui-system)
15. [Helpers](#15-helpers)
16. [Utilities](#16-utilities)
17. [Database Layer](#17-database-layer)
18. [Webhook Logger](#18-webhook-logger)
19. [Placeholders](#19-placeholders)
20. [Emoji System](#20-emoji-system)
21. [Categories & Help System](#21-categories--help-system)
22. [Sticky Messages](#22-sticky-messages)
23. [Saved Data System](#23-saved-data-system)
24. [Welcomer / Greeter](#24-welcomer--greeter)
25. [AFK System](#25-afk-system)
26. [Blacklist & Noprefix](#26-blacklist--noprefix)
27. [Antinuke System](#27-antinuke-system)
28. [Typescript Config](#28-typescript-config)
29. [Build & Run](#29-build--run)
30. [Developer Response Rules (Golden Rules)](#30-developer-response-rules-golden-rules)
31. [Common Gotchas & Non-Obvious Rules](#31-common-gotchas--non-obvious-rules)
32. [Birthday System](#32-birthday-system)
33. [Vanity Role System](#33-vanity-role-system)
34. [Autoresponder System](#34-autoresponder-system)

---

## 1. Project Overview

**Levitate** (internally code-named "Nomadic") is a TypeScript Discord bot focused on **moderation, anti-nuke, and utility**. There is no music functionality. Every user-visible response uses Discord's **Components V2** format (`MessageFlags.IsComponentsV2`), never classic embeds for bot-generated UI.

The bot is designed to run multiple named instances (Main, TheSecond, TheThird, BETA) from the same codebase, each with its own client ID, status/presence configuration, and display style. The running instance is identified at boot via the `DISCORD_CLIENT_ID` environment variable.

**Developer:** Reyansh (`922491166149214218`)  
**Bot name:** Levitate  
**Default prefix:** `$`  
**Support server:** https://discord.gg/YpCfcCTXdv

---

## 2. Tech Stack

| Layer | Library / Tool | Version / Notes |
|---|---|---|
| Language | TypeScript | Target ES2022, ESM (`"type":"module"`) |
| Discord API | discord.js | v14 |
| WS sharding | @discordjs/ws | `SimpleShardingStrategy` |
| Process clustering | discord-hybrid-sharding | ClusterManager + ClusterClient |
| Database | MongoDB | via custom `Database` class (Mongoose-like) |
| Build | `tsc` | Output to `dist/`, paths include `.js` extensions |
| Runtime | Node.js | Requires v18+ for native fetch & top-level await |
| Environment | dotenv | `import 'dotenv/config'` at entry points |
| Hosting | Replit | `hardcodeHostingService: "Replit"` in config |

All source is under `xoxo/` (plus root `index.ts`). Compiled output lands in `dist/`. The `reference1/` directory contains the original reference bot (`soul/`) — it is **excluded from `tsc`** and is never imported at runtime.

---

## 3. Repository Layout

```
index.ts                    ← ClusterManager entry point
xoxo/
  levitate.ts               ← Per-cluster bootstrap (login → ready)
  config.ts                 ← Central runtime configuration
  emojis.ts                 ← All emoji IDs used in responses
  config/
    botInstances.ts         ← Per-bot status/presence table + StatusManager types
    categories.ts           ← Help menu category metadata
    debugConfig.ts          ← Debug command tunables
    hostingServices.ts      ← IP-to-provider-name map (auto-detection)
  structures/
    LevitateClient.ts       ← Extended discord.js Client
    StatusManager.ts        ← Presence/status rotator
    RatingCanvas.ts         ← Canvas image generator for rating commands ($howcute, $gay, etc.)
    NowPlayingCanvas.ts     ← Canvas image generator for the music now-playing card
  database/
    database.ts             ← MongoDB interface (Database class + initDatabase)
  handlers/
    eventLoader.ts          ← Scans dist/xoxo/events/**/*.js, registers listeners
    helperLoader.ts         ← Scans dist/xoxo/helpers/*.js, calls factory functions
    commandLoader.ts        ← Scans dist/xoxo/commands/**/*.js, registers prefix cmds
    slashLoader.ts          ← Scans dist/xoxo/slashCommands/**/*.js, registers slash cmds
    commandRegister.ts      ← REST PUT /applications/:id/commands for slash cmds
  events/
    discord/
      messageCreate.ts
      interactionCreate.ts
      guildCreate.ts
      guildDelete.ts
      guildMemberAdd.ts
      guildMemberUpdate.ts
      shardReady.ts
      shardDisconnect.ts
      shardError.ts
      shardReconnecting.ts
      shardResume.ts
      error.ts
      warn.ts
  commands/
    developer/              ← Owner-only commands (not shown in help)
    data/                   ← create-data, view-data, delete-data, send-data
    info/                   ← ping, debug, help
    moderation/             ← ban, kick, timeout, untimeout, unban, hackban, warn, warnings, clearwarnings, strip, lock, unlock, lockdown, lockdown-lift, …
    utility/                ← avatar, banner, sticky, purge, archive, setprefix, container, …
    vcControls/             ← join, leave, rejoin, mute, unmute, deafen, undeafen, disconnect, shift
    welcomer/               ← greet, greet-channel, greet-message, greet-test, …
    customisation/          ← setavatar, setbanner, setbio, setname, resetprofile
    fun/                    ← ship
  slashCommands/            ← Slash command builders (optional; same category layout)
  components/
    statusMessages.ts       ← sendSuccess / sendError / sendInfo / sendLoading
    wrongUsage.ts           ← sendWrongUsage
    purgeConfirm.ts         ← buildPurgeConfirmPayload + generic action variants
    botActionConfirm.ts     ← restart-bot / stop-bot CV2 confirm prompt
    helpMenu.ts             ← Help menu CV2 payload builders + session tracking
    blacklistList.ts        ← buildBlacklistListPayload
    noprefixList.ts         ← buildNoprefixListPayload
    avatarBanner.ts         ← Server-vs-global choice prompt for avatar/banner
    afk.ts                  ← AFK confirmation, notice, removed, duration formatting
    placeholderHelp.ts      ← Paginated placeholder docs panel
    viewDataMenu.ts         ← $view-data session + handlers
    deleteDataMenu.ts       ← $delete-data session + handlers
    sendDataMenu.ts         ← $send-data session + handlers
    welcomer/
      greetSender.ts        ← Shared welcome message dispatcher
    fun/
      ship.ts               ← Ship image generator (canvas) + CV2 payload builder
    moderation/
      ban.ts                ← Ban success panel + DM
      kick.ts               ← Kick success panel + DM
      timeout.ts            ← Timeout add/remove panels + DMs
      untimeout.ts          ← UnTimeout list panel + result panel + interaction handler
      unban.ts              ← Unban list panel + result panel + interaction handler
      hackban.ts            ← Hackban success panel (no DM)
      warn.ts               ← Warn success panel + DM + warnings list panel + clearwarnings result panel
      strip.ts              ← Strip success panel
      actionConfirm.ts      ← confirmSlashAction — generic slash confirm/cancel/timeout wrapper
    utility/
      userinfo.ts           ← All CV2 payload builders for $userinfo (About/Roles/Perms/Assets)
      container.ts          ← Interactive CV2 container builder — session state, payload builders, modal handlers
  messages/
    ping.ts                 ← buildPingPayload (CV2)
    debug.ts                ← Debug home/category/allstats payload builders + sessions
  helpers/
    debugStats.ts           ← gatherDebugStats + per-section line formatters
    stickyHelper.ts         ← Sticky engine (updateSticky, setStickyAndPost)
    placeholders.ts         ← resolvePlaceholders + placeholder map
    getHostingServiceIP.ts  ← Detects hosting provider by public IP
    getHostingServiceName.ts
    imagePanel.ts           ← Reusable image+download panel (avatar, banner)
    emojiParser.ts          ← parseSayText — handles custom emoji in say/afk reason
    emojiResolver.ts        ← resolveEmoji — fetches emoji from guild or application
    parseDuration.ts        ← formatDuration, parseDurationMs
    devTimeTweak.ts         ← parseTimeExpression (for special-afk time arg)
    userResolver.ts         ← Resolve user IDs/mentions
    purgeHelper.ts          ← Bulk-delete logic for purge commands
  utils/
    webhookLogger.ts        ← Singleton queued webhook log sender
    formatting.ts           ← formatUptime, formatBytes, escapeFormatting, …
    wsPing.ts               ← resolveWsPing helper
reference1/                 ← Reference bot (excluded from tsc, never imported)
dist/                       ← Compiled JS output
package.json
tsconfig.json
```

---

## 4. Environment Variables / Secrets

All secrets are managed via Replit Secrets. Never hardcode them.

| Secret | Purpose |
|---|---|
| `DISCORD_TOKEN` | Discord bot token for login |
| `DISCORD_CLIENT_ID` | Discord application/client ID — selects the BotInstance |
| `MONGO_URI` | MongoDB connection string |
| `READY_LOG_WEBHOOK_URL` | Webhook for bot-ready events |
| `SHARD_LOG_WEBHOOK_URL` | Webhook for shard lifecycle events |
| `JOIN_LEAVE_WEBHOOK_URL` | Webhook for guild join/leave events |
| `ERROR_LOG_WEBHOOK_URL` | Webhook for uncaught errors |
| `COMMAND_LOG_WEBHOOK_URL` | Webhook for command usage logs |
| `SESSION_SECRET` | (reserved; not used in main bot code) |
| `BOT_IDENTIFIER` | **Used.** Prefixes every Mongo collection name (`${BOT_IDENTIFIER}_${collection}`) in `xoxo/database/database.ts` so multiple bot instances can safely share one MongoDB database. Not reserved/unused — correcting a previous doc error. |

**Important:** `DISCORD_CLIENT_ID` does double duty — it is passed to `discord-hybrid-sharding` and it is also used by `botInstances.ts` to select which BotInstance configuration applies. The Main instance uses `process.env["DISCORD_CLIENT_ID"] ?? ""` as its `clientId`, so the correct instance config is automatically selected without hardcoding any ID.

---

## 5. Configuration

**File:** `xoxo/config.ts`

Single exported `config` object and the named export `botName`. Imported with `import config from '../config.js'` or `import { config, botName } from '../config.js'`.

### Key fields

| Field | Value | Notes |
|---|---|---|
| `botName` | `"Levitate"` | Used everywhere instead of hardcoding |
| `botToken` | `process.env["DISCORD_TOKEN"]` | Undefined if not set |
| `clientId` | `process.env["DISCORD_CLIENT_ID"]` | Undefined if not set |
| `prefix` | `"$"` | Default prefix; individual guilds can override via DB |
| `language` | `"TypeScript"` | Debug display only |
| `developers` | `[["Reyansh", "922491166149214218"]]` | Array of `[name, id]`; first = main dev |
| `hardcodeHostingService` | `""` | Bypasses IP detection when non-empty; set `""` to use auto |
| `databaseProvider` | `"MongoDB Atlas"` | Debug display only |
| `notesChannelId` | `"1521510471276957837"` | Where `$note` posts |
| `noteDivider` | decorative string | Sent after every `$note` post |
| `savedDataChannelId` | `"1520465483495641250"` | Where `$create-data` stores payloads |
| `dataDivider` | decorative string | Sent after every saved-data post |
| `deletedDataChannelId` | `"1520495793268850760"` | Where deleted-data events are logged |
| `stickyDataChannelId` | `"1521487031279157299"` | Where sticky payload files are archived |
| `stickyDataDivider` | decorative string | Sent after sticky archive uploads |
| `embedColor` | `"#b4f8c8"` | Default accent color (used by webhook logger) |
| `supportServer` | `"https://discord.gg/YpCfcCTXdv"` | Shown in help menu footer |
| `supportServerId` | `"1493286181885050961"` | Support server guild ID — its saved name style is used as the global default for all other guilds |
| `webhooks` | object of 5 URLs | All from env; any may be undefined |
| `defaultPresence` | `{ name, type, status }` | Fallback when no BotInstance matches |

---

## 6. Bot Instances & Status

**File:** `xoxo/config/botInstances.ts`

This is the per-bot presence and status configuration table.

### BotInstance fields

| Field | Type | Description |
|---|---|---|
| `buildName` | string | Shown in debug "Build" line |
| `clientId` | string | Matched against `DISCORD_CLIENT_ID` at boot |
| `name` | string | Printed in `[STATUS]` startup log |
| `displayStatus` | `DisplayStatus \| DisplayStatus[]` | Status pill: `"online" \| "idle" \| "dnd" \| "invisible" \| "mobile"` |
| `mode` | `"presence" \| "status"` | Which kind of activity to display |
| `statusRotation` | `"single" \| "multi"` | Whether to rotate through `statusEntries` |
| `presenceRotation` | `"single" \| "multi"` | Whether to rotate through `presenceEntries` |
| `statusEntries` | `{ text }[]` | Custom Status entries (used when `mode === "status"`) |
| `presenceEntries` | `{ activityType, text, streamUrl? }[]` | Presence entries (used when `mode === "presence"`) |

### Rotation interval

`ROTATION_INTERVAL_MS = 10000` ms (10 seconds). All rotations share this interval.

### The four instances

| Name | clientId | displayStatus | mode | Rotation |
|---|---|---|---|---|
| Main (`"Nomadic"`) | `process.env.DISCORD_CLIENT_ID` | `"mobile"` | `"status"` | multi (5 status entries) |
| TheSecond | `1471514482067902545` | `"idle"` | `"presence"` | single |
| TheThird | `1457601829738250301` | `"dnd"` | `"presence"` (Streaming) | single |
| BETA | `1442787596131373166` | `"dnd"` | `"presence"` | single |

**Main's status entries:** `"Oh my bitches."` / `"💗 feeling cute"` / `"✨ When the sun goes down…"` / `"I'm a vampire, baby!"` / `"Screwing with {users} people."`

**Main's presence entries** (shown in `presenceEntries` even though current `mode` is `"status"`): Listening `/help | {guilds} Guilds | {users} Users`, Watching `XO Tour '26`, Playing `with my heart`, Playing `Stray Kids!`

### Mobile device hint

The "mobile" indicator (green phone icon on the user popup) requires injecting `browser: 'Discord Android'` into the WS IDENTIFY payload. This is done via `ws.buildStrategy` (wrapping `SimpleShardingStrategy`) passed in the Client constructor options — it cannot be set after login. See `LevitateClient.ts`.

### Text interpolation in entries

Both `statusEntries.text` and `presenceEntries.text` support:
- `{guilds}` → total guild count
- `{users}` → total user count across all guilds
- `{botName}` → bot's Discord username

---

## 7. Entry Point — `index.ts`

Top-level ClusterManager. Spawns OS processes; each process runs `dist/xoxo/levitate.js`.

### What it does

1. Validates `DISCORD_TOKEN` is present.
2. Runs a **pre-flight gateway check** (`GET /gateway/bot`) — exits on **any non-OK response**: with specific messaging for 401 (invalid token) and 429 (rate-limited), and a generic error line for all other HTTP failures. Network failures (fetch throws) are treated as warnings (bot still launches).
3. Creates `ClusterManager` with `totalShards: 'auto'`, `shardsPerClusters: 2`, `totalClusters: 'auto'`, `mode: 'process'`, `respawn: true`, restart limit 5 per 15 min.
4. Spawns clusters with infinite timeout.

### Events listened to on the manager

| Event | What it logs |
|---|---|
| `clusterCreate` | Cluster ID + which shards it manages |
| `clusterError` | Cluster ID + error message |
| `clusterExit` | Cluster ID + exit code + signal |

---

## 8. Per-Cluster Bootstrap — `xoxo/levitate.ts`

Runs inside each cluster process. Controls the full boot sequence.

### Boot order

```
1.  new LevitateClient()           ← selects BotInstance, sets mobile hint + initial presence
2.  client.login(token)            ← establishes gateway connection
3.  await clientReady              ← waits for the ready event
4.  [CLIENT] Logged in as …        ← console.log
5.  getHostingServiceIP()          ← IP lookup for debug menu hosting display
6.  initDatabase(buildName)        ← MongoDB connect; fatal error is non-fatal (bot runs without DB)
7.  loadCachedDataBlock()          ← noprefix state, AFK cache, guild prefix map
8.  loadAllEvents(client)          ← registers all event handlers
9.  loadHelpers(client)            ← loads helpers into client.helpers
10. loadPrefixCommands(client)     ← maps prefix commands into client.commands + client.aliases
11. loadSlashCommands(client)      ← maps slash commands into client.slashCommands
12. registerSlashCommands(client)  ← REST PUT /applications/:id/commands (global registration)
13. StatusManager.start()          ← applies initial presence (or falls back to defaultPresence)
14. enforceBlacklistedServers()    ← fire-and-forget: leaves blacklisted guilds
15. sendPendingRestartNotification() ← fire-and-forget: posts restart success if pending
16. webhookLogger.logReady()       ← sends embed to readyLog webhook
17. [YAY!] Bot fully initialized   ← console.log
```

### Cached data block (step 7)

| Data | What is loaded |
|---|---|
| Noprefix global state | `db.getNoprefixGlobalEnabled()` |
| Guilds with noprefix disabled | `db.getNoPrefixDisabledGuilds()` |
| AFK cache | `db.populateAfkCacheSilent()` |
| Guild prefix map | `db.getAllGuildPrefixes()` |

All failures here are non-fatal (`.catch(() => false/[]/new Map())`).

### Side-effects at boot-end

- **enforceBlacklistedServers:** Queries all blacklisted server IDs, finds any the bot is still in, sends the blacklist message to a readable channel, then leaves.
- **sendPendingRestartNotification:** Reads a DB record written by `$restart-bot` before it triggered the restart. On boot, retrieves the channel/guild, clears the record, and posts a CV2 "Bot restarted successfully." message mentioning the main developer.

---

## 9. Client Structure — `LevitateClient`

**File:** `xoxo/structures/LevitateClient.ts`

Extends `discord.js.Client`. All public properties:

| Property | Type | Description |
|---|---|---|
| `cluster` | `ClusterClient<this>` | discord-hybrid-sharding handle |
| `config` | `Config` | Full config object from `xoxo/config.ts` |
| `commands` | `Collection<string, any>` | Prefix commands (keyed by name) |
| `slashCommands` | `Collection<string, any>` | Slash commands (keyed by name) |
| `aliases` | `Collection<string, string>` | Alias → command name |
| `cooldowns` | `Collection<string, number>` | Command cooldown tracking |
| `helpers` | `Record<string, any>` | Loaded helper factories (keyed by filename sans `.js`) |
| `stickyMessages` | `Map<string, string>` | `"guildId-channelId"` → last sticky message ID (loop guard) |
| `db` | `Database` | MongoDB interface; guarded with `if (client.db)` until init |
| `statusManager` | `StatusManager \| undefined` | Presence rotator; set after loaders |
| `matchedInstance` | `BotInstance \| null` | Which BotInstance matched at construction |

### Discord intents

```
Guilds, GuildMembers, GuildMessages, MessageContent, DirectMessages
```

Partials: `Channel, Message, User, GuildMember`

### REST config

`timeout: 30_000`, `retries: 3`

### Sharding

Uses `getInfo()` from `discord-hybrid-sharding` to read which shards this cluster owns from the environment variables injected by the ClusterManager.

---

## 10. Status Manager

**File:** `xoxo/structures/StatusManager.ts`

Drives the bot's gateway presence (activity + status pill) after login.

### How it works

1. **Match:** finds the `BotInstance` whose `clientId` matches the running bot's ID.
2. **`buildInitialPresenceFor(inst)`** (static): called before `super()` in `LevitateClient` to build the initial presence for the IDENTIFY payload.
3. **`start()`**: applies the current entry immediately, then starts `setInterval` timers for each enabled rotation.

Three independent rotators (each ticks at `ROTATION_INTERVAL_MS`):
- **displayStatus** — cycles through the status pill values (if array).
- **statusEntries** — cycles through Custom Status entries (if `statusRotation === "multi"`).
- **presenceEntries** — cycles through presence entries (if `presenceRotation === "multi"`).

### Applying presence

Uses a **raw gateway packet** (`ws.broadcast({ op: GatewayOpcodes.PresenceUpdate, d: {...} })`) rather than `client.user.setPresence()`. This is intentional: discord.js's `ClientPresence._parse` strips the `emoji` field from Custom Status activities, which would prevent custom emoji from appearing. The raw broadcast preserves them.

### `"mobile"` status

`"mobile"` is a device hint, not a real gateway status. When converting to a gateway status, `toGatewayStatus("mobile")` returns `"online"`. The mobile phone icon is set separately in `LevitateClient` via `identifyProperties` during the WS handshake.

---

## 11. Loaders

All loaders read from `dist/` (compiled output), not source.

### Event Loader (`xoxo/handlers/eventLoader.ts`)

- Scans `dist/xoxo/events/**/*.js` recursively.
- Each event file must export:
  - `name: string` — the discord.js event name.
  - `once?: boolean` — if true, registered with `client.once`.
  - `execute(...args): Promise<void> | void` — handler.
- The client is **injected as the last argument** by the loader (not passed to `EventEmitter.on` directly).

### Helper Loader (`xoxo/handlers/helperLoader.ts`)

- Scans `dist/xoxo/helpers/*.js` (top-level only, not recursive).
- Each file must have a `default export` that is a **factory function**: `(client: LevitateClient) => any`.
- The factory is called with the client; the returned value is stored as `client.helpers[<filename>]`.
- Access: `client.helpers.stickyHelper`, `client.helpers.getGuildPrefix`, etc.

### Command Loader (`xoxo/handlers/commandLoader.ts`)

- Scans `dist/xoxo/commands/**/*.js` recursively.
- Each file must export `options` (with at least `name` and `aliases`) and `prefixExecute`.
- Registered in `client.commands` by name, and each alias registered in `client.aliases`.

### Slash Loader (`xoxo/handlers/slashLoader.ts`)

- Scans **`dist/xoxo/commands/**/*.js`** recursively (same files as the prefix loader).
- Each file that exports a `slashExecute` function is registered as a slash command in `client.slashCommands` by name.
- Slash and prefix execute functions live in the **same command file** — there is no separate `slashCommands/` source for runtime logic.

### Slash Registrar (`xoxo/handlers/commandRegister.ts`)

- Collects all `data` exports (SlashCommandBuilder instances) from **`dist/xoxo/slashCommands/**/*.js`** — this is the builder-only directory.
- Performs `REST PUT /applications/:id/commands` (global registration) once at boot.
- Skips silently if `DISCORD_TOKEN` or `DISCORD_CLIENT_ID` are missing, or if no builders are found.
- **User-install guard:** Before pushing to Discord, any builder whose `toJSON()` output lacks an `integration_types` array is automatically stamped with `integration_types: [0]` (GuildInstall only) + `contexts: [0]` (Guild only). This prevents Discord from surfacing guild-only commands (moderation, music, antinuke, etc.) to users who have the bot installed as a user app in servers the bot is not a member of. Builders that already call `setIntegrationTypes()` are left untouched.

**Summary of the split:** `xoxo/commands/` holds runtime logic (`prefixExecute` + `slashExecute`); `xoxo/slashCommands/` holds only builder definitions (`data` export) used solely for REST registration. The slash loader reads the former; the slash registrar reads the latter.

### User-Installable App

The bot supports Discord's user-install model. Users can add the bot as a personal app (not just a guild app) and use a subset of commands anywhere — in servers the bot isn't in, in DMs, and in group DMs.

**User-installable commands** (builders call `setIntegrationTypes([GuildInstall, UserInstall])` + `setContexts([Guild, BotDM, PrivateChannel])`):
- Fun: `howgay`, `howcute`, `howrizz`, `howsimp`, `howintelligent`, `howautistic`, `ship`, `wanted`, `whowouldwin`, `rps`, `tictactoe`, `image`
- Utility: `avatar`, `banner`, `userinfo`, `vanity`, `host-image`

**Guild-less execution rules** (when `interaction.guild` is `null` — user-install in a non-member server):
- `avatar` / `banner`: slash builders use **subcommands** (`user [user]`, `bot`, `server`) so options are mutually exclusive — no user+target confusion. In guild-less execution, the `server` subcommand returns a clear message; `user` and `bot` show global avatar/banner only.
- `userinfo`: `fetchUserData` skips `guild.members.fetch()` and `isOwner` check; all user-level data (flags, badges, server tag, global avatar/banner) still works.
- `howgay` / `howcute` / `howrizz` / `howsimp` / `howintelligent` / `howautistic`: member fetch for display name is null-safe; falls back to `globalName ?? username`.
- `wanted` / `whowouldwin`: no guild data needed at all — guard removed.
- `rps`: opponent member fetch for display name is null-safe; falls back to username.
- `ship`: random-member mode requires a guild — if no guild and no users provided, returns a clear message asking to specify a user instead.
- All other guild-only commands retain their `if (!guild) return error` guards because they are **not** user-installable.

---

## 12. Events

All in `xoxo/events/discord/`. Client is always injected as the last arg by the event loader.

### `messageCreate`

The most complex event. Handles all prefix-command routing.

**Flow:**
1. **Sticky update** — `updateSticky(client, message)` is called for every guild message (including bot messages) before any other check. This is what re-posts stickies.
2. Bail if bot or not in guild.
3. **Resolve prefix** — guild DB override, then global `config.prefix`.
4. **Blacklist checks** (if DB available) — user blacklist and server blacklist; sends CV2 error and returns if either is active.
5. **Bot-mention prefix** — if message starts with `@bot`, treat as a prefix: no args → show current prefix; args → run command; unknown command → show error.
6. **Normal prefix path** — `message.content.startsWith(prefix)`.
7. **No-prefix path** — `hasNoPrefixAccess()` checks: always true for developers; otherwise requires `noprefixGlobalEnabled && !guildDisabled && isNoPrefixUser`.
8. **Developer gate** — commands with `options.owner === true` or `options.isDeveloper === true` are blocked for non-developers.
9. **Attach raw args** — `message.commandRawArgs` is set to the full string after the command name, preserving whitespace and newlines. Commands that need this (say, note, AFK reason) read from `message.commandRawArgs` instead of the split `args` array.
10. **Log to webhook** — `webhookLogger.logCommand(...)`.
11. **Execute** — `command.prefixExecute(message, args, client)`.

### `interactionCreate`

Routes all incoming interactions to the correct handler.

**Slash commands:** lookup in `client.slashCommands`; dev-gate; webhook log; `command.slashExecute(interaction, client)`.

**Button interactions** — routed by `customId` prefix:

| Prefix | Handler |
|---|---|
| `debug:*` | Debug nav (home / allstats / category key) |
| `help:*` | Help nav (home / allcommands / category name) |
| `phhelp:prev\|next\|noop` | Placeholder help pagination |
| `viewdata:prev\|next` | View-data pagination |
| `deldata:prev\|next\|confirm\|cancel` | Delete-data pagination + confirm/cancel |
| `senddata:prev\|next` | Send-data pagination |
| `customise:*` | Customise panel (profile/namestyle/reset/cancel/done) — `handleCustomiseInteraction` in `xoxo/components/customisation/customise.ts` |

**String select menus** — routed by `customId`:

| customId | Handler |
|---|---|
| `debug:nav` | Debug category selection |
| `help:nav` | Help category selection |
| `viewdata:select` | Send selected saved-data item |
| `deldata:select` | Show delete confirmation for selected item |
| `senddata:select` | Send selected item then delete the panel |
| `untimeout:select` | Un-timeout selected members |
| `unban:select` | Unban selected user from the banned-users dropdown |

### `guildCreate`

Logs join to console + sends webhook embed via `webhookLogger.logGuildJoin(guild)`.

### `guildDelete`

Logs leave (skips unavailable guilds) + `webhookLogger.logGuildLeave(guild)`.

### `guildMemberAdd`

Calls `sendGreetMessage(member, client, false)` — dispatches the configured welcome message, if any.

### `guildMemberUpdate`

Detects **natural timeout expiry** (not manual removal):  
- `oldMember.communicationDisabledUntil` was set, `newMember.communicationDisabledUntil` is now null.  
- Old expiry must be at or before `now + 10s` (grace window for timing skew).  
- Sends a `buildTimeoutExpiredDmPayload` DM to the member.

### `shardReady / shardDisconnect / shardError / shardReconnecting / shardResume`

All log to console and send to `webhookLogger.logShard(event, shardId, error?)`.

### `error`

Logs to console + `webhookLogger.logError(error, 'discord client')`.

### `warn`

Logs to console only.

---

## 13. Commands

### Command file contract

```typescript
export const options = {
  name: 'command-name',
  aliases: ['alias1', 'alias2'] as string[],
  description: 'What this does.',
  usage: 'command-name <required> [optional]',
  category: 'moderation',   // determines which help menu section it appears under
  owner: false,              // true = developer-only (hidden from help, gated)
  cooldown: 3,               // seconds; 0 = no cooldown
};

export async function prefixExecute(message, args, client) { ... }
export async function slashExecute(interaction, client) { ... }   // optional
```

For developer-only commands, `owner: true` gates execution in both `messageCreate` and `interactionCreate`.

### Command categories

| Category | Folder | Shown in help? |
|---|---|---|
| Info | `info/` | Yes |
| Moderation | `moderation/` | Yes |
| Antinuke | `antinuke/` | Yes |
| Purge | `purge/` | Yes |
| Utility | `utility/` | Yes |
| Server | `server/` | Yes |
| VC Controls | `vcControls/` | Yes |
| Welcomer | `welcomer/` | Yes (birthday merged in) |
| Logging | `logging/` | Yes |
| Autoresponder | `autoresponder/` | Yes |
| Data | `data/` | Yes |
| Customisation | `customisation/` | Yes |
| Fun | `fun/` | Yes |
| Developer | `developer/` | **No** (excluded from help) |

**Removed categories:** `birthday/` merged into `welcomer/`. Every category must contain ≥2 commands; single-command categories are not permitted.

### Full command list

#### Info
| Command | Aliases | Description |
|---|---|---|
| `$help` | — | Interactive CV2 help menu with category navigation |
| `$ping` | — | API latency, WS ping, DB ping |
| `$debug` | — | Detailed stats with interactive category navigation |
| `$invite` | `addbot`, `botinvite`, `inv` | Bot invite link — CV2 panel: `## <brownishSparkles> Add {botName}`, visible divider separators, `<whiteArrow>` emoji before invite hyperlink + support-server link |
| `$node-status` | `nodestatus`, `ns` | Show the active Lavalink node and the full configured priority list. Available to **everyone** (`owner: false`). |

#### Moderation
| Command | Aliases | Description |
|---|---|---|
| `$ban` | — | Ban a user; DMs them first; optional delete-days; slash has confirmation |
| `$kick` | — | Kick a user; DMs them first; slash has confirmation |
| `$timeout` | `$to` | Timeout a user with duration (e.g. `1h30m`); DMs them; slash has confirmation |
| `$untimeout` | `$uto` | Remove timeout; if no user arg, shows multi-select panel of timed-out members; slash has confirmation |
| `$unban` | — | Unban a user by ID; if no ID given, shows multi-select panel of banned users |
| `$hackban` | `$forceban` | Ban a user by ID even if not in the server; no DM attempted; slash has confirmation |
| `$warn` | — | Warn a member; stored in DB; DMs the target |
| `$warnings` | `$warns` | View a member's warning history |
| `$clearwarnings` | `$clearwarns` | Clear all warnings for a member (with confirmation) |
| `$strip` | — | Remove all of a member's roles (skips managed/higher roles); slash has confirmation |
| `$lock` | — | Lock a channel (remove SendMessages from @everyone) |
| `$unlock` | — | Unlock a channel |
| `$lockdown` | — | Lock every text channel in the server (with confirmation); `lockdown unlock` reverses; slash also has `/lockdown-lift` |
| `$nick` | `nickname` | Change a member's nickname (`nick <user> <new nickname>` — both required), or reset up to 10 members at once (`nick reset <user1> [user2] ... [user10]`). When targeting the bot itself, bypasses `manageable` and uses the REST `@me` endpoint. Guild owner is explicitly rejected. Reset mode accepts mentions, IDs, or usernames and reports per-member success/failure. |
| `$massnick` | `massnickname` | Change all members' nicknames — prepend, append, remove, or reset. Interactive **6-button panel** across two action rows: Row 1 — All Members / Humans Only / Bots Only; Row 2 — Specific Role (opens a `RoleSelectMenuBuilder` dropdown on a second page) / Members (prompts invoker to type up to 10 members by mention, ID, or username in a 60 s message collector) / Cancel. Buttons auto-disable after **5 minutes** on timeout — no text replacement. `remove <word>` strips the word from each member's effective displayed name (server nickname if set, otherwise globalName/username). |
| `$masskick` | — | Kick all members matching criteria with confirm prompt |
 | `$role` | — | `$role add <user> [role]` adds a role, `$role remove <user> [role]` removes one, and `$role <user>` opens the combined add/remove role picker |
| `$roleall` | `allrole`, `giveall` | Give a role to all/humans/bots — button panel chooses target group; rate-limit-safe batching (10/sec) |
| `$slowmode` | `$sm`, `$ratelimit` | Set channel slowmode — accepts duration format (`30s`, `5m`, `2h 30m`) |
| `$reactionmute` | `rmute`, `reactmute` | Prevent a member from adding reactions anywhere in the server |
| `$reactionunmute` | `runmute`, `reactunmute` | Restore a member's ability to add reactions |
| `$hide` | `hidechannel` | Hide one or more channels from @everyone |
| `$unhide` | `unhidechannel` | Unhide one or more previously hidden channels |
| `$nsfw` | — | Toggle the NSFW flag on one or more channels |
| `$delete-channel` | `deletechannel`, `delchannel` | Delete a channel after confirmation |
| `$nuke` | — | Delete and instantly recreate one or more channels with identical settings |

#### Antinuke
| Command | Aliases | Description |
|---|---|---|
| `$antinuke` | `$an`, `$antinukesetup` | Full antinuke control panel — prefix-only, requires Administrator. Subcommands: `status`, `help`, `enable`, `disable`, `config`, `modules`, `module <name> enable\|disable\|punishment <type>\|threshold <count>\|info`, `profiles`, `profile <name>` (lockdown\|strict\|balanced\|lenient), `whitelist list\|add <user\|role>\|remove <user\|role>`, `logs <#channel>\|disable`, `quarantine-role <@role>`, `reset` |

#### Purge
| Command | Aliases | Description |
|---|---|---|
| `$purge` | `$clear` | Bulk-delete messages; subcommands include `all`, `amount`, `bot`, `humans`, `user`, `text`, `images`, `files`, `links`, `link`, `between`, `embeds`, `reactions` |
| `$purge-till` | `purgetill`, `pt` | Delete messages up to a specific message ID |
| `$snipe` | `s` | Show the last deleted message in a channel |
| `$reactionsnipe` | `rs`, `rsnipe` | Show the last removed reaction in a channel |

#### Utility
| Command | Aliases | Description |
|---|---|---|
| `$afk` | — | Set AFK status (server or global); auto-removed on next message |
| `$sticky` | — | Manage sticky messages (set, enable, disable, view) |
| `$autorole` | `ar`, `autoroles` | Configure roles automatically given to new members and bots when they join |
| `$vanityrole` | `vr`, `vanityroles` | Auto-assign roles based on a status/bio keyword or the server tag |
| `$alias` | — | Create a personal, private nickname for any command you can use |
| `$firstmessage` | `firstmsg` | Get details about the first message ever sent in this channel |
| `$host` | `hosting`, `hoster` | Shows where the bot is hosted and some technical details |
| `$react` | — | Add a reaction to a message |
| `$archive` | — | Save recent channel messages (default 100, max 500) to a `.txt` file and DM it to the invoker |
| `$list` | `$ls` | Paginated list of roles, members, bots, emojis, stickers, channels, or bans. Rich detail panel per item with full entity info (roles: perms + icon + tags; members: roles + key perms + timestamps; bots: username/ID/nickname/timestamps/roles/integration role/key perms + avatar thumbnail; channels: topic + slowmode + category; emojis/stickers: image gallery + metadata; bans: avatar + reason). |
| `$container` | `$cb`, `$containerbuilder`, `$build` | Interactive CV2 message builder. Block types: Text, Spacer (line/gap, no modal — select-menu configured), Info Card (text+picture), Photo Grid, Quick Links (`Label \| url` format). Controls: Edit / Remove / Duplicate / Color / Move / Send / Save as Data / Clear All. Post Here or pick a channel. **Save as Data** (Administrator-only) prompts for a name via modal, checks for conflicts via `savedDataNameExists`, uploads the container JSON to `config.savedDataChannelId`, posts `config.dataDivider`, and writes a `type: 'cv2'` record via `createSavedData` — reusable later with `$send-data`/`$view-data`. Session expires after 10 min. Component file exports `startBuilderSession` + `builderSessions`. |
| `$embed` | — | Interactive **classic-embed** builder (one of the few places classic embeds are intentionally used, alongside a live control panel). Sections: Basic Info (title/description/color/url), Author, Footer, Images, Fields (up to 25), and **Buttons** (up to 5 Link-style buttons — label + URL + optional emoji, added/edited/removed via a select-menu list identical in shape to the Fields flow). The button row renders live under the embed preview and is included when sending (Post Here / channel select) and when using **Save as Data** — the saved JSON is `{ embeds: [...], components: [...] }` rather than a bare embed object, so `$send-data`/`$view-data` reconstruct the Link buttons alongside the embed. Component file: `xoxo/components/utility/embed.ts`, entry point `startEmbedBuilderSession`. |
| `$webhook` | `$webhooks`, `$wh` | Interactive webhook manager (Manage Webhooks required, both user and bot). Home panel lists every webhook the bot can see in the server (`guild.fetchWebhooks()`) via a select menu, plus **Create Webhook** (channel select → modal for name + optional avatar URL). Selecting a webhook opens a manage panel: **Send Message** (content + optional per-message username/avatar override), **Rename**, **Change Avatar**, **Move Channel**, **Delete** (confirm step), **Back**. Avatar URLs are passed straight to discord.js, which fetches and resolves them server-side. Component file: `xoxo/components/utility/webhook.ts`, entry point `startWebhookSession`. |
| `$vanity` | — | Look up a Discord vanity URL — shows server name/ID/members/online + invite link if taken, or marks it available if free |
| `$enlarge` | `jumbo`, `big` | Show a custom emoji as a full-size image (CV2 MediaGallery). Accepts emoji markdown (`<:name:id>` / `<a:name:id>`), a raw numeric ID, `:name:`, or a bare name. Resolves from the guild cache first, then the full client cache. CDN URL: `https://cdn.discordapp.com/emojis/<id>.<png\|gif>?size=4096`. Component: `xoxo/components/utility/enlarge.ts`. Cooldown: 3 s. |
| `$impersonate` | `mimic` | Send a message as another server member via a temporary webhook (uses their server nickname and server avatar). Requires **Manage Messages** or **Administrator**. Bot needs **Manage Webhooks** in the channel. Webhook is deleted immediately after sending. Command message is deleted on success. Cooldown: 6 s. Category: `features` (file lives in `xoxo/commands/features/`). `noTyping: true` prevents a visible typing indicator with no follow-up bot message. |
| `$whoping` | `$wp`, `$whoponged` | Show the last 10 messages that directly pinged a user in this channel (direct `<@id>` and reply-pings only — no role mentions). Optional arg: `@user` or user ID to check someone else. Component file: `xoxo/components/utility/whoping.ts`. |
| `$ghostping` | `$gp`, `$ghostpng` | Ghost-ping up to 10 users — sends a message that pings them then immediately deletes it. Administrator permission required. Role mentions rejected. Slash builder in `xoxo/slashCommands/utility/ghostping.ts` exposes `user` (required) + `user2`–`user10` (optional). Cooldown 10s. |
| `$host-image` | `hostimage`, `imgbb`, `upload-image` | Upload an image (attachment or URL) and get back hosted links |
| `$say` | `echo` | Make the bot say something. Requires **Manage Messages** or **Administrator**. Supports `\n`, custom emoji `$emoji<id>` syntax, file attachments, and reply-passthrough. |
| `$placeholder-help` | `$ph`, `$phhelp` | Paginated placeholder token reference |

#### Server
| Command | Aliases | Description |
|---|---|---|
| `$serverinfo` | `$si`, `$guildinfo`, `$guild` | 5-tab CV2 panel: Overview (name/ID/owner/features), Members (counts/boosts/channels), Channels (type breakdown/expressions), Security (verification/roles), Assets (icon/banner/splash/discovery) — buttons active 3 min. |
| `$membercount` | `$mc`, `memcount` | Shows the server's total, human, and bot member counts |
| `$userinfo` | `$ui`, `$whois` | 4-tab CV2 panel: About, Roles, Permissions, Assets (buttons active 3 min) |
| `$avatar` | `$av`, `$pfp` | Show a user's avatar; prompts server vs global if different |
| `$banner` | `$bn` | Show a user's banner; prompts server vs global if different |
| `$setprefix` | `prefix`, `changeprefix` | Set a custom prefix for this guild (ManageGuild) |
| `$resetprefix` | — | Reset guild prefix to default |
| `$selfprefix` | `$sp`, `$myprefix` | Set/view/remove a personal prefix — works globally for that user, alongside the server prefix. No special permissions required. |

#### VC Controls
| Command | Aliases | Description |
|---|---|---|
| `$join` | — | Make the bot join a voice channel (your current channel, or specify by name/mention) |
| `$leave` | — | Make the bot leave the voice channel |
| `$rejoin` | — | Make the bot rejoin its current voice channel (destroys and recreates the player) |
| `$mute` | — | Server-mute a voice member |
| `$unmute` | — | Remove server-mute |
| `$deafen` | — | Server-deafen a voice member |
| `$undeafen` | — | Remove server-deafen |
| `$disconnect` | `$dsc`, `$devoice` | Disconnect a member from VC |
| `$shift` | — | Move a member to a different VC |

#### Welcomer
| Command | Aliases | Description |
|---|---|---|
| `$greet` | `welcomer`, `welcome` | Show current greet configuration |
| `$greet-channel` | `gc`, `greet-ch` | Set or view the greet channel |
| `$greet-message` | `gm`, `greet-msg` | Set or view the greet message text |
| `$greet-test` | `gtest` | Send a test greet message as if you just joined |
| `$greet-bots` | `gbots` | Toggle whether bots trigger the greet |
| `$birthday` | `bday`, `bd` | Show birthday settings for this server + your own birthday. Subcommands: `set <date>` (multiple date formats — `15/04`, `15-04-2000`, `April 15`, `2000-04-15`), `unset`, `list` (upcoming birthdays of members in this server), `channel set <#channel>\|remove` (ManageGuild), `message set <text> [data: <name>]\|remove` (ManageGuild). A birthday is global to a user (one date shared across every server); the announcement channel/message are per-server. See §32 for full details. |

#### Autoresponder
| Command | Aliases | Description |
|---|---|---|
| `$autoresponder` | `ares`, `autoresponders` | Create, edit, and manage auto-reply triggers. Interactive paged home panel — see §35 for full details. |

#### Logging
| Command | Aliases | Description |
|---|---|---|
| `$log` | `logs`, `logging` | Open the interactive logging config panel, or inline: `$log <category> <#channel\|enable\|disable>`. Categories: `channel`, `member`, `message`, `modlog`, `role`, `vc`, `server` |

#### Data
| Command | Aliases | Description |
|---|---|---|
| `$create-data` | `createdata`, `cdata` | Save a message/embed/CV2 payload for later use (Admin only) |
| `$view-data` | `viewdata`, `vdata` | Browse and send saved data via interactive dropdown |
| `$delete-data` | `deletedata`, `ddata` | Delete saved data with confirmation flow |
| `$send-data` | `senddata`, `sdata` | Send saved data directly (panel is deleted after send) |

#### Customisation
| Command | Aliases | Description |
|---|---|---|
| `$customise` | `customize` | Interactive CV2 profile panel — two visible divider separators (one after title, one before buttons). Buttons: **Profile** (directly opens a single "Edit Profile" modal: Display Name, Bio, Avatar URL, Banner URL text inputs + Avatar file upload, Banner file upload via `LabelBuilder`+`FileUploadBuilder`; file upload takes priority over URL for same field; submit or dismiss returns to home page), **Namestyle** (opens namestyle form inline, pre-populated from DB; **← Back** button returns to customise home page by re-registering the customise session and rebuilding the home page via `backFn` on the NS session), **Reset Profile** (confirm step, danger red; **← Back** returns to home), **Done**. Description text has no leading dashes. Accent color `#F39399`. Bot's server avatar shown as thumbnail. Session active 10 minutes. Requires Administrator. |
| `$namestyle` | `ns` | Opens a single-page name-style form directly — font dropdown (12 options), effect dropdown (6 options), color preset dropdown (15 presets), gradient-only second-color dropdown, **Custom Hex** button (modal with color1+color2 hex fields, pre-filled from session). All dropdowns pre-populated from the guild's saved style. Apply button enabled when all required fields are filled. Requires Manage Server. |
| `$setavatar` | `setav`, `setpfp` | Change the bot's server avatar — attachment or image URL, or `reset` |
| `$setbanner` | `setbn`, `setcover` | Change the bot's server banner — attachment or image URL, or `reset` |
| `$setbio` | — | Change the bot's about-me bio |
| `$setname` | — | Change the bot's username |
| `$resetprofile` | — | Reset bot server profile (nick/avatar/banner/bio) to global defaults |

#### Fun
| Command | Aliases | Description |
|---|---|---|
| `$ship` | — | Ship two users and generate a compatibility image |
| `$howgay` | `gay` | See how gay someone is |
| `$howsimp` | `simp` | See how much of a simp someone is |
| `$howcute` | `cute` | See how cute someone is |
| `$howautistic` | `autistic` | See how autistic someone is |
| `$howintelligent` | `intelligent`, `iq`, `howsmart`, `intelligence` | See how intelligent someone is |
| `$howrizz` | `rizz` | See how much rizz someone has |
| `$wanted` | — | Turn a user into a Wild West wanted poster |
| `$whowouldwin` | `wwn` | See who would win in a battle between two users |
| `$guessthenumber` | `gtn` | Try to guess the number the bot is thinking of |
| `$tictactoe` | `ttt` | Play tic tac toe against another member or the bot |
| `$rps` | `rockpaperscissors` | Play rock paper scissors against the bot (`$rps`) or challenge another user (`$rps @user`). Session-based (no message collectors) — every interaction acknowledged globally, no "interaction failed" errors. PvP flow: challenged user accepts/declines, challenger picks first (move hidden), opponent picks, result revealed simultaneously. Session timeout: 2 minutes (message components auto-disabled). Components: `xoxo/components/fun/rps.ts` (session + builders), `xoxo/components/fun/rpsHandler.ts` (global handler). |
| `$image` | `img`, `imagesearch` | Search for an image using DuckDuckGo Images (strict safe-search enforced). Displays the first result in a CV2 MediaGallery panel with Prev / Next navigation buttons to browse up to 8 results. Session timeout: 3 minutes. Session-based (no message collectors). Components: `xoxo/components/fun/image.ts` (session + builders + DDG search), `xoxo/components/fun/imageHandler.ts` (global button handler). |

#### Developer (hidden, `owner: true`)
| Command | Aliases | Description |
|---|---|---|
| `$blacklist` | — | Add/remove/list blacklisted users |
| `$blacklist-server` | — | Add/remove/list blacklisted servers |
| `$noprefix` | — | Add/remove/list noprefix users; toggle global/guild state |
| `$say` | `echo` | *(category: `utility`, `owner: false`)* Say text as the bot. Requires **Manage Messages** or **Administrator**. Supports `\n`, custom emoji via `{:emojiId:}` syntax, and file attachments. |
| `$say-embed` | — | Send an embed JSON as the bot |
| `$say-cv2` | — | Send a CV2 JSON payload as the bot |
| `$note` | — | Post a styled note to the notes channel |
| `$log` | `logs`, `logging` | Configure server logging — opens home panel, or `$log <category> <#channel\|enable\|disable>` for inline changes |
| `$console-log` | — | Print arbitrary text to the process console (developer diagnostics; renamed from the ambiguous `log` name to avoid colliding with the guild-logging `$log` command) |
| `$serverlist` | `servers`, `guildlist` | View all servers the bot is in with an interactive panel |
| `$bias` | — | Set a fixed rating percentage bias for a user (affects the "how X" fun rating commands) |
| `$emoji` | — | Show info or steal an emoji |
| `$restart-bot` | — | Restart the bot process (saves pending channel to DB) |
| `$stop-bot` | `s-bot` | Stop the bot process. Confirm prompt shows the current hosting provider; writes a `.stop-flag` file (`dist/.stop-flag`) before exiting so a host watchdog force-respawn re-exits immediately instead of fully coming back online — see §31 gotchas. |
| `$steal` | `snag`, `copyemoji` | Steal an emoji, sticker, or image URL into one or more mutual servers. Resolves by emoji markdown/ID/name or sticker ID/name; images ask emoji-or-sticker type. Multi-select server dropdown, then name prompt (`$default` uses original name). Up to 3 re-prompts on invalid names. |
| `$fixbotroles` | `fixbotrole`, `renamebotrole` | Developer-only. Renames the bot's managed integration role in every guild to the current `config.botName` (e.g. after a rebrand from "Roxanne"). Skips guilds where the bot lacks ManageRoles or the role is already correct. |
| `$special-afk` | `specialafk`, `devafk` | Set AFK with a custom Since/Till time |
| `$special-purge` | — | Developer-level purge with extended options |
| `$global-ar` | `gar`, `globalar` | Manage global autoresponders across all guilds — paged multi-select panel to toggle `is_global` per trigger |

---

## 14. Components V2 UI System

**The default UI pattern for bot responses is Components V2** (`MessageFlags.IsComponentsV2`). All command replies, interactive panels, and status messages use CV2 builders. Classic embeds are intentionally supported in a small number of cases — explicitly:

### Architectural rule — CV2 builders belong in `xoxo/components/`, not in command files

Command files (`xoxo/commands/**/*.ts`) must contain **only** command metadata (`options`), data-fetching logic, collector/session management, and the two execute functions. All CV2 `ContainerBuilder` construction — every `TextDisplayBuilder`, `SectionBuilder`, `MediaGalleryBuilder`, `ActionRowBuilder`, etc. — must live in a corresponding file under `xoxo/components/`. Follow the existing subdirectory pattern:

| Command category | Component location |
|---|---|
| `commands/moderation/` | `components/moderation/<name>.ts` |
| `commands/utility/`    | `components/utility/<name>.ts` |
| `commands/welcomer/`   | `components/welcomer/<name>.ts` |
| *(other categories)*   | `components/<category>/<name>.ts` |

Export only the types, ID factories, and the top-level `buildPayload` (or equivalent) that the command's runner needs. Keep all internal builder functions private to the component file.

Classic embeds are intentionally supported in a small number of cases — explicitly:
- **Sticky messages** with `type === 'embed'` are sent as `{ embeds: [...] }` (no CV2 wrapper).
- **`$say-embed`** sends an embed JSON payload directly.
- **Webhook log messages** (always classic embeds — webhooks can't reliably use CV2).

Outside these three cases, do not use classic embeds in new code.

### Author-only interactive panels

Any panel whose collector should only respond to the person who ran the command must use the shared `authorOnlyFilter(interaction, authorId, matches?)` helper from `xoxo/helpers/panelGuard.ts` as (or inside) its collector `filter`. It checks `interaction.user.id === authorId` (and an optional customId predicate), and — critically — replies ephemerally with "This panel is not for you." on mismatch instead of silently ignoring the click or accepting it from anyone. Every interactive panel added after this convention was introduced (embed builder, webhook manager, CV2 message builder, confirm/cancel prompts, etc.) uses it; new panels should too rather than hand-rolling `i.user.id === authorId` checks.

### Core building blocks (discord.js v14)

| Class | Use |
|---|---|
| `ContainerBuilder` | Top-level wrapper for all CV2 messages |
| `TextDisplayBuilder` | `.setContent(text)` — renders Markdown |
| `SeparatorBuilder` | `.setDivider(true)` — horizontal rule |
| `SectionBuilder` | Side-by-side text + thumbnail |
| `ThumbnailBuilder` | `.setURL(url)` — image in section accessory |
| `MediaGalleryBuilder` + `MediaGalleryItemBuilder` | Image galleries |
| `ActionRowBuilder<ButtonBuilder>` | Button rows |
| `ActionRowBuilder<StringSelectMenuBuilder>` | Select menu rows |
| `ButtonBuilder` | `.setCustomId()`, `.setLabel()`, `.setStyle()`, `.setDisabled()` |
| `StringSelectMenuBuilder` | Dropdowns |
| `StringSelectMenuOptionBuilder` | Individual dropdown options |

### Standard status messages (`xoxo/components/statusMessages.ts`)

All use `ContainerBuilder` + `TextDisplayBuilder`. Context can be interaction, channel, or prefix message.

```typescript
sendSuccess(context, content)   // emojis.blacktick + content
sendError(context, content)     // emojis.redcross + content
sendInfo(context, content)      // emojis.info + content
sendLoading(context, content)   // emojis.loading + content
sendWrongUsage(context, commandName, usage, footer?)
reservedForDeveloper(context)
blacklistedUser(context)
blacklistedServer(context, guild, client)
sendNote(channel, keyword, body, imageUrl?)
```

**StatusContext interface:**
```typescript
interface StatusContext {
  interaction?: ChatInputCommandInteraction;
  message?: Message;
  channel?: TextBasedChannel;
  existingMessage?: Message;  // if set, edits this message instead of sending
  reply?: boolean;            // false → send (not reply) for message path
  mention?: boolean;          // whether to ping the user in reply
  asReply?: boolean;          // false → send to channel even for interactions
}
```

### Session pattern

Interactive menus (help, debug, view-data, delete-data, send-data, placeholder-help) all follow the same pattern:
1. **Register session** — stored in a module-level `Map<messageId, Session>`.
2. **Inactivity timeout** — a `setTimeout` at `N` minutes disables all buttons/selects and edits the message.
3. **Ownership check** — only the user who ran the command can interact. Others get an ephemeral "Only the person who ran this command can navigate it."
4. **Reset timeout** — every interaction resets the timeout.
5. **Clean up** — session and timeout cleared when the session ends naturally or times out.

---

## 15. Helpers

Located in `xoxo/helpers/`. Loaded by `helperLoader` into `client.helpers.*`.

### `debugStats.ts`

- `gatherDebugStats(client, apiMs): Promise<DebugStats>` — collects all debug info: guild/user/channel counts (aggregated across clusters via `broadcastEval`), RAM/CPU/event loop, cluster/shard info, latencies, architecture, and counters.
- Per-section formatters: `buildGeneralLines`, `buildSystemLines`, `buildClusterLines`, `buildLatencyLines`, `buildArchitectureLines`, `buildOtherLines`.
- CPU fallback: if real CPU reads as 0%, generates a fake value in [3.0%, 5.0%] range.
- `minTotalRamMB: 8092` — clamps the total RAM display to at least 8 GB.

### `stickyHelper.ts`

See [§22 Sticky Messages](#22-sticky-messages).

### `placeholders.ts`

See [§19 Placeholders](#19-placeholders).

### `getHostingServiceIP.ts`

Fetches the container's public IP, matches it against `hostingServices.ts` to produce a human-readable provider name (e.g. `"Replit"`). The result is cached and exposed via `getHostingProviderName()`. Config's `hardcodeHostingService: "Replit"` bypasses this.

### `emojiParser.ts` — `parseSayText(text, resolver)`

Used by `$say` and `$special-afk`. Parses `{:emojiId:}` tokens in text, calls the resolver to look up each emoji, returns the resolved string. Invalid emojis are reported in the `invalid` array.

### `emojiResolver.ts` — `resolveEmoji(client, id, guild)`

Tries to find an emoji by ID in the guild's emoji cache, then the client's application emojis. Returns the `<a:name:id>` or `<:name:id>` string.

### `parseDuration.ts`

- `parseDuration(input): number | null` — parses duration strings like `1h30m`, `7d`, `30s`, `1dec` into milliseconds. Supported units: `s`, `m`, `h`, `d`, `w`, `mo`, `y`, `dec` (decade) plus their long-form aliases (seconds, minutes, hours, days, weeks, months, years, decade/decades). Mixed units allowed: `1h30m`. **Max: 10 decades** (~316 years); returns `null` if exceeded.
- `formatDuration(ms): string` — formats milliseconds back into a human-readable string. Includes decades as the largest unit.

### `devTimeTweak.ts` — `parseTimeExpression(token, now)`

Developer-only time parser for `$special-afk`. Accepts:
- Relative durations: `-2h`, `+1d12h`, `-100y`, `1y2mo3w4d5h6m7s`, `500ms`
- Discord timestamps: `<t:1735689600>`
- Bare Unix integers (seconds or milliseconds)
- ISO 8601 dates: `2025-12-31`

### `imagePanel.ts`

Reusable CV2 panel for displaying an avatar or banner with "Send in DM" and "Download" buttons. Used by `$avatar` and `$banner`.

### `userResolver.ts`

Resolves user mentions/IDs/usernames to a discord.js User or GuildMember object. Accepted formats (in precedence order):
1. Mention `<@id>` / `<@!id>`
2. Snowflake ID (17–20 digits)
3. `Username#discriminator` tag — covers bot tags like `BotName#0000`; searches guild members first, then the client user cache
4. Plain username or display name (guild member search)

### `purgeHelper.ts`

Bulk-delete logic: handles the 100-message Discord API limit, filters by user/content/type where applicable, and reports results.

---

## 16. Utilities

Located in `xoxo/utils/`.

### `formatting.ts`

| Export | Description |
|---|---|
| `formatDuration(ms, showDays?)` | Audio-style MM:SS or HH:MM:SS; or `"Xd Xh Xm"` if showDays |
| `truncate(str, maxLen)` | Cuts to maxLen with `...` |
| `formatNumber(num)` | `toLocaleString()` |
| `formatBytes(bytes, decimals?)` | `"1.23 MB"` etc. |
| `formatDate(date)` | `"Jan 15, 2024"` |
| `formatRelativeTime(date)` | `"3 hours ago"` etc. |
| `capitalize(str)` | First letter uppercase |
| `escapeFormatting(text)` | Escapes `\*_~\`\|>#-` for Discord |
| `escapeMarkdown(text)` | Alias of `escapeFormatting` |
| `formatUptime(seconds)` | `"1d 2h 3m 4s"` |
| `formatShortYear(year)` | `"'26"` |
| `formatCreatedAt(date)` | `"Friday, 02:30:15 PM, 15 April, '26"` (UTC) |
| `formatOrdinal(n)` | `"1st"`, `"2nd"`, `"23rd"`, `"11th"` |

### `wsPing.ts` — `resolveWsPing(client, apiMs)`

Tries to read WS ping from the client's WS manager shards, falls back to `apiMs` if unavailable.

### `webhookLogger.ts`

See [§18 Webhook Logger](#18-webhook-logger).

---

## 17. Database Layer

**File:** `xoxo/database/database.ts`

A custom MongoDB interface class (`Database`) initialized via `initDatabase(buildName)`. The client exposes it as `client.db`. Commands must always guard with `if (!client.db) return sendError(...)`.

### Key database methods (not exhaustive)

**Prefix**
- `getGuildPrefix(guildId)` → `string | null`
- `setGuildPrefix(guildId, prefix)`
- `resetGuildPrefix(guildId)`
- `getAllGuildPrefixes()` → `Map<string, string>`

**Blacklist**
- `isUserBlacklisted(userId)` → `boolean`
- `addUserToBlacklist(userId)`
- `removeUserFromBlacklist(userId)`
- `getBlacklistedUsers()` → `any[]`
- `getBlacklistGlobalEnabled()` → `boolean`
- `isServerBlacklisted(guildId)` → `boolean`
- `addServerToBlacklist(guildId)`
- `removeServerFromBlacklist(guildId)`
- `getBlacklistedServers()` → `any[]`
- `getBlacklistServerGlobalEnabled()` → `boolean`

**No-prefix**
- `isNoPrefixUser(userId)` → `boolean`
- `addNoPrefixUser(userId)`
- `removeNoPrefixUser(userId)`
- `getNoPrefixUsers()` → `any[]`
- `getNoprefixGlobalEnabled()` → `boolean`
- `setNoprefixGlobalEnabled(value: boolean)`
- `isGuildNoPrefixDisabled(guildId)` → `boolean`
- `getNoPrefixDisabledGuilds()` → `any[]`

**AFK**
- `setAFK({ userId, guildId, scope, reason, imageUrl, sinceAt, tillAt })`
- `getAFK(userId, guildId?)` → record or null
- `removeAFK(userId, guildId?)`
- `populateAfkCacheSilent()` → count of cached entries

**Saved Data**
- `createSavedData({ name, guildId, messageId, type, createdBy })` → `true | 'duplicate' | false`
- `getSavedData(guildId, name)` → `SavedDataDoc | null`
- `getAllSavedData(guildId)` → `SavedDataDoc[]`
- `deleteSavedData(guildId, name)` → `boolean`
- `savedDataNameExists(guildId, name)` → `boolean`

**Sticky**
- `getSticky(guildId, channelId)` → record or null
- `setSticky(guildId, channelId, type, payload, lastMessageId)`
- `setStickyEnabled(guildId, channelId, enabled)`
- `setStickyLastMessageId(guildId, channelId, messageId)`

**Greet / Welcomer**
- `getGreetSettings(guildId)` → settings record or null
- `setGreetChannel(guildId, channelId)`
- `setGreetMessage(guildId, text)`
- `setGreetData(guildId, dataName)`
- `setGreetBots(guildId, value: boolean)`

**Birthdays** (see §32)
- `getBirthday(userId)` / `setBirthday(userId, day, month, year|null)` / `removeBirthday(userId)`
- `getBirthdaysByMonthDay(month, day)` → `BirthdayDoc[]` (used by the daily scheduler)
- `getBirthdaysForUsers(userIds[])` → `BirthdayDoc[]` (used by `birthday list`)
- `getBirthdaySettings(guildId)` / `setBirthdayChannel(guildId, channelId)` / `setBirthdayMessage(guildId, text, dataName)`
- `hasBirthdayBeenAnnounced(guildId, userId, year)` / `recordBirthdayAnnouncement(guildId, userId, year)`

**Bot restart**
- `getPendingRestartChannel()` → `{ channelId, guildId } | null`
- `setPendingRestartChannel(channelId, guildId?)`
- `clearPendingRestartChannel()`

**Warnings** (`warnings` collection — `WarningDoc`: `{ guildId, userId, reason, moderator_id, created_at }`)
- `addWarning(guildId, userId, reason, moderatorId)`
- `getWarnings(guildId, userId)` → `WarningDoc[]`
- `countWarnings(guildId, userId)` → `number`
- `clearWarnings(guildId, userId)` → `number` (count cleared)

**Stats**
- `getGlobalCommandsExecuted()` → `number`
- `ping()` → latency in ms

**Logging System** (`log_configs` collection — `LogConfigDoc`)
- `getLogConfig(guildId)` → full config, backfilled with defaults if missing
- `setLogAllChannel(guildId, channelId)`
- `setLogCategoryChannel(guildId, category, channelId)`
- `setLogAllEnabled(guildId, enabled)`
- `setLogCategoryEnabled(guildId, category, enabled)`
- `setLogCategoryExceptions(guildId, category, exceptions)`

Log categories: `all`, `channel`, `member`, `role`, `vc`, `message`, `server`, `modlog`.  
`all_enabled` defaults to **false** for new guilds; every per-category `enabled` defaults to **true**.

### Modlogs (integrated under Logging System)

Modlogs are just another log category: `modlog`. They are configured through `$log modlog <#channel|enable|disable>` (or the interactive `$log` panel). No separate `$modlog` command exists.

- Channel lookup: `xoxo/utils/modlogHelper.ts` reads `cfg.modlog.channel_id`; if unset and `all_enabled` is true, it falls back to `cfg.all_channel_id`.
- Helper: `sendModLog(client, guildId, payload)` is **fire-and-forget** — never throws, never blocks a moderation action.
- CV2 builders: `xoxo/components/moderation/modlog.ts` — one builder per action (ban, kick, timeout, untimeout, unban, hackban, warn, clearwarnings, strip, nick).
- Hook pattern: call `sendModLog(...)` without `await` after a successful moderation action, before any `return`.

### SavedDataDoc shape

```typescript
interface SavedDataDoc {
  name:       string;      // guild-unique name (≤50 chars)
  guildId:    string;
  message_id: string;      // ID of the storage-channel message holding the file
  type:       'message' | 'embed' | 'cv2';
  created_at: Date | null;
  created_by: string;      // user ID of the creator
}
```

---

## 18. Webhook Logger

**File:** `xoxo/utils/webhookLogger.ts`

Singleton class (`WebhookLogger.getInstance()`). Exported as the default export; consumed throughout the codebase as `import webhookLogger from '../../utils/webhookLogger.js'`.

### Design

- All sends go through a **FIFO queue** with a 200ms interval processor — prevents hitting Discord's webhook rate limit.
- If the queue exceeds 30 items, a warning is printed to console.
- Each webhook URL is read from `config.webhooks` at initialization.

### Methods

| Method | Webhook | Trigger |
|---|---|---|
| `logReady(client)` | `readyLog` | Bot ready |
| `logGuildJoin(guild)` | `joinLeave` | Guild joined |
| `logGuildLeave(guild)` | `joinLeave` | Guild left |
| `logCommand(name, user, guild, args, prefixInfo?)` | `commandLog` | Any command executed |
| `logShard(event, shardId, error?)` | `shardLog` | Shard lifecycle events |
| `logError(error, context?)` | `errorLog` | Client `'error'` event |

### Webhook emojis

Webhook embeds use hardcoded animated emoji from the developer's server (since webhooks can't access Application Emojis from other servers). These are defined at the top of `webhookLogger.ts` and must be updated if the server changes.

---

## 19. Placeholders

**File:** `xoxo/helpers/placeholders.ts`

Resolved via `resolvePlaceholders(text, ctx)`. All tokens use `${token_name}` syntax. Unknown tokens are left as-is.

### Full token reference

**User**
| Token | Value |
|---|---|
| `${user_name}` | username (no discriminator) |
| `${user_display_name}` | guild nickname → global display name → username |
| `${user_mention}` | `<@userId>` |
| `${user_id}` | user ID |
| `${user_tag}` | same as `${user_name}` (discriminators removed in modern Discord) |
| `${user_avatar}` | avatar URL (PNG, 256px) |
| `${user_avatar_gif}` | animated avatar if animated, else PNG |
| `${user_banner}` | banner URL, empty string if none |
| `${user_created_at}` | account creation date (YYYY-MM-DD) |
| `${user_joined_at}` | guild join date (YYYY-MM-DD), empty if unavailable |
| `${user_roles}` | comma-separated role names (excl. @everyone) |
| `${user_highest_role}` | name of the highest non-@everyone role, or `"No role"` |
| `${user_is_bot}` | `"Yes"` or `"No"` |

**Server**
| Token | Value |
|---|---|
| `${server_name}` | guild name |
| `${server_id}` | guild ID |
| `${server_icon}` | icon URL (PNG, 256px) |
| `${server_member_count}` | total member count |
| `${server_membercount_ordinal}` | ordinal form (1st, 2nd, 3rd, 40th…) |
| `${server_owner_id}` | owner's user ID |
| `${server_owner_mention}` | `<@ownerId>` |
| `${server_created_at}` | creation date (YYYY-MM-DD) |
| `${server_boost_count}` | number of active boosts |
| `${server_boost_tier}` | boost tier (0–3) |

**Channel**
| Token | Value |
|---|---|
| `${channel_name}` | channel name |
| `${channel_id}` | channel ID |
| `${channel_mention}` | `<#channelId>` |

**Time (UTC)**
| Token | Value |
|---|---|
| `${timestamp}` | Unix timestamp (seconds) |
| `${date}` | YYYY-MM-DD |
| `${time}` | HH:MM:SS |
| `${datetime}` | YYYY-MM-DD HH:MM:SS |
| `${discord_ts}` | `<t:unix:F>` (Discord long date+time) |
| `${discord_ts_relative}` | `<t:unix:R>` (Discord relative) |

**Bot**
| Token | Value |
|---|---|
| `${bot_name}` | bot username |
| `${bot_mention}` | `<@botId>` |
| `${bot_id}` | bot client/application ID |
| `${bot_avatar}` | bot avatar URL (PNG, 256px) |

**Misc**
| Token | Value |
|---|---|
| `${newline}` | actual newline character |
| `${zero_width}` | zero-width space (`\u200B`) |

Placeholders are resolved **at use time**, not at save time. The raw payload is always stored as-is in the database.

---

## 20. Emoji System

**File:** `xoxo/emojis.ts`

All emojis used in bot responses are centralized here as a `emojis` object. Never hardcode emoji strings in command/component files — always import from here.

Common emojis referenced throughout the codebase (partial list):

| Key | Usage |
|---|---|
| `emojis.blacktick` | Success responses |
| `emojis.redcross` | Error responses |
| `emojis.info` | Info responses |
| `emojis.loading` | Loading states |
| `emojis.greentick` | Moderation success |
| `emojis.greentick1` | Alternate green tick |
| `emojis.blackCross` | Section headers |
| `emojis.blackCards` | Data/command section headers |
| `emojis.whiteCards` | Secondary data headers |
| `emojis.whiteArrow` | List items in debug/help |
| `emojis.whiteArrow2` | Alternate arrow |
| `emojis.blackButterfly` | Bot name decoration |
| `emojis.gothicHeart` | Help menu greeting |
| `emojis.AFK` | AFK confirmation header |
| `emojis.whiteGhost` | AFK notice header |
| `emojis.bluePlanet` | AFK removed notice |
| `emojis.sabrinaTaste` | Note command header |
| `emojis.SabrinaFU` | User blacklist message |
| `emojis.blackbatman` | Debug header |
| `emojis.clock` | Timeout indicator |
| `emojis.redBlackCross` | Ping error state |
| `emojis.bloodRip` | Blacklist/command-info headers |

---

## 21. Categories & Help System

**File:** `xoxo/config/categories.ts`

```typescript
interface CategoryInfo {
  index: number;       // sort order in help menu
  name: string;        // lowercase; matches command option.category
  displayName: string; // shown in the menu
  description: string; // shown as dropdown option description
}
```

`excludedCategories: string[]` — categories excluded from the help menu entirely. Currently: `['developer', 'developerinfo']`.

### Help menu (`xoxo/components/helpMenu.ts`)

Interactive CV2 menu with:
- **Header section** with bot avatar thumbnail
- **Category list** or all-commands list
- **Navigation row**: "Home" + "All commands" buttons
- **Category dropdown**: select menu with category options
- Session timeout: **3 minutes** of inactivity → buttons/dropdown disabled
- Session guard: only the invoker can navigate

Four payload builders:
- `buildHelpMenuPayload(client, userId, guildId?, disabled?)` — home page
- `buildAllCommandsPayload(client, userId, guildId?, disabled?)` — full list
- `buildCategoryPayload(client, userId, category, guildId?, disabled?)` — single category
- `buildCommandInfoPayload(client, commandName, guildId?)` — single command info

Footer links: Support Server + Invite link (built from `clientId`).

Developer-only commands are excluded from all help pages. If a user explicitly requests
one with `$help <command>` (including an alias), help responds that the command belongs
to developers only instead of revealing its usage. Direct prefix and slash attempts by
non-developers receive the same response.

---

## 22. Sticky Messages

**File:** `xoxo/helpers/stickyHelper.ts`

One sticky per (guild, channel). Re-posts itself to the bottom of the channel whenever any new message arrives.

### Architecture

- **Storage:** `sticky_messages` MongoDB collection. Fields: `guildId`, `channelId`, `type`, `payload` (full string stored in DB — no fetch needed per message), `enabled`, `last_message_id`.
- **In-memory cache:** `client.stickyMessages: Map<"guildId-channelId", lastSentMessageId>` — fast loop guard.
- **Lock set:** `updatingLocks: Set<string>` — prevents re-entrancy on rapid bursts.

### Sticky types

| Type | Payload | How sent |
|---|---|---|
| `text` | Plain string (≤2000 chars) | `channel.send({ content: payload })` |
| `cv2` | JSON string (parsed) | `channel.send({ components, flags: IsComponentsV2 })` |
| `embed` | JSON string (parsed) | `channel.send({ embeds: [...] })` |

### `updateSticky(client, message)` — called for EVERY guild message

1. Fast path: check in-memory cache. If the new message IS the last sticky, skip.
2. Concurrency guard: skip if already updating this channel.
3. DB read: fetch sticky config. Skip if not enabled or no payload.
4. DB loop guard: skip if `last_message_id === message.id`.
5. Delete previous sticky (from cache or DB).
6. Send new sticky via `postStickyToChannel`.
7. Debounce: lock releases after 200ms.

### `setStickyAndPost(client, channel, guildId, channelId, type, payload)`

- Deletes any existing sticky message.
- Persists to MongoDB (`db.setSticky`).
- Archives a copy to `config.stickyDataChannelId` (fire-and-forget).
- Posts the new sticky and records the new message ID.

### Commands: `$sticky`

Subcommands: `set data <name>`, `set text <content>`, `enable`, `disable`, `view`. Requires **Manage Server** permission.

---

## 23. Saved Data System

Allows administrators to save reusable message/embed/CV2 payloads and later send them to any channel.

### Data flow

**Saving (`$create-data`):**
1. Parse type arg (`message`/`embed`/`cv2`; aliases: `messages`, `embeds`, `components`).
2. Collect raw data (inline text or file attachment, ≤512KB).
3. Validate JSON (embed and CV2 types).
4. Prompt for a name via message collector (60s timeout, name ≤50 chars).
5. Check name uniqueness in this guild.
6. Confirm/Cancel button prompt (60s).
7. Post metadata text + file attachment to `config.savedDataChannelId`.
8. Post the `config.dataDivider`.
9. Save `{ name, guildId, message_id, type, created_by }` to DB.

**Viewing (`$view-data`):**
- Dropdown with up to 25 items per page (Prev/Next pagination).
- Selecting an item fetches the file from the storage channel, resolves placeholders in the caller's context, sends it to the current channel as the appropriate type.
- Session timeout: 5 minutes.

**Deleting (`$delete-data`):**
- Same dropdown layout.
- Selecting triggers a Confirm/Cancel prompt.
- On confirm: removes from DB, downloads the file, deletes the storage message + its divider, logs the deletion (with the file re-attached) to `config.deletedDataChannelId`, posts the `config.dataDivider` there too.

**Sending (`$send-data`):**
- Same dropdown layout.
- Selecting sends the data directly to the channel, then **deletes the panel message**.
- No persistent post — the panel disappears after the send.

### Storage format

Each saved item's actual payload is stored as a **file attachment** on a message in `config.savedDataChannelId`. The DB record only stores the message ID to look it up. This allows arbitrarily large payloads (up to Discord's attachment size limit) without MongoDB document size concerns.

---

## 24. Welcomer / Greeter

**File:** `xoxo/components/welcomer/greetSender.ts`

`sendGreetMessage(member, client, isTest?)` — dispatches the configured welcome message.

### Dispatch logic

1. Load greet settings from DB (`db.getGreetSettings(guild.id)`).
2. If no `channel_id` → skip.
3. Skip bots on real joins unless `greet_bots` is enabled.
4. If no `message_text` and no `message_data` → skip.
5. Resolve the greet channel.
6. Build `PlaceholderContext` from the joining member.
7. Resolve `message_text` placeholders if present.
8. If `message_data` is set → `dispatchSavedData()`:
   - Fetches the stored payload from `config.savedDataChannelId`.
   - Resolves all placeholders.
   - Sends as the appropriate type:
     - **message**: joined with greet text (newline), chunked at 2000 chars.
     - **embed**: JSON parsed; greet text merged into `content`.
     - **cv2**: greet text prepended as a TextDisplay (type 42) component.
9. If only `message_text` → send as plain `content`.

### Commands

| Command | Permission | Description |
|---|---|---|
| `$greet` | ManageGuild | Show current greet config |
| `$greet-channel set <channel>` | ManageGuild | Set the greet channel |
| `$greet-channel view` | ManageGuild | Show current channel |
| `$greet-message set <text>` | ManageGuild | Set greet text (with placeholder support) |
| `$greet-message data <name>` | ManageGuild | Set greet to use a saved data item |
| `$greet-message view` | ManageGuild | Show current greet message |
| `$greet-test` | ManageGuild | Runs `sendGreetMessage` with `isTest=true`, using the invoker as the "joining" member |
| `$greet-bots on\|off` | ManageGuild | Toggle whether bots trigger greet |

---

## 25. AFK System

**File:** `xoxo/components/afk.ts`

### Normal AFK (`$afk`) — `xoxo/commands/utility/afk.ts`

- User sets reason (and optionally an image URL or attachment).
- Confirmation prompt with three buttons: **Server AFK**, **Global AFK**, **Cancel**.
- **Server AFK** (`scope: "server"`) — only shows AFK notice in the current guild.
- **Global AFK** (`scope: "global"`) — shows notice in all mutual servers.
- AFK is automatically removed when the user sends a message (handled in `messageCreate`).
- When someone mentions an AFK user (or replies to their message), `buildAfkNoticePayload` is sent showing: display name, since/till timestamps, reason, optional image, and who mentioned them at what time.
- AFK removal and notice are both handled in `xoxo/events/discord/messageCreate.ts` — it uses `db.isUserAFK()` (in-memory cache) for fast path, then `db.removeActiveAFKForMessage()` to clean up, and `db.getAFK()` for notice lookups.

### Developer AFK (`$special-afk`)

Same flow but with a **custom time** as the first argument. Time parsed by `parseTimeExpression`:
- **Past time** → stored as `sinceAt` (AFK started X time ago).
- **Future time** → stored as `tillAt` (AFK ends at this time, shown as "Till:" in the notice).

### Duration formatting

`formatHumanDuration(ms)` (in `afk.ts`) — returns English text like `"2 hours and 30 minutes"`, `"1 day, 3 hours, and 15 minutes"`. Handles centuries, decades, years, months, days, hours, minutes, seconds.

---

## 26. Blacklist & Noprefix

### Blacklist

Managed by `$blacklist` (users) and `$blacklist-server` (servers). Both have a global-enabled toggle.

**User blacklist** — checked in `messageCreate` before any command runs. When blacklisted, `blacklistedUser()` is sent (blunt message) and processing stops.

**Server blacklist** — checked in `messageCreate`. When blacklisted, `blacklistedServer()` is sent (mentions server owner, links to support server and main developer). Also enforced at bot startup via `enforceBlacklistedServers()`.

### No-prefix

Allows specific users to run commands without the prefix.

- **Global enabled toggle** — `db.setNoprefixGlobalEnabled(true/false)`.
- **Per-guild disabled list** — individual guilds can opt out.
- **Developers always have no-prefix access**, regardless of the toggle.
- Managed by `$noprefix add/remove/list/global/guild` (developer-only).
- **User self-toggle** — `$mynop` (alias `mynoprefix`, category `utility`, no permission): any user who has an active, non-expired noprefix entry can disable or re-enable it for themselves. Stored as `selfDisabled: boolean` on their `NoPrefixUserDoc`. `isNoPrefixUser()` returns `false` when `selfDisabled === true`, so the no-prefix path is suppressed without touching the expiry or the entry itself. Developers bypass this entirely (always have access, told so if they run the command). Self-disabling does **not** extend or reset the expiry window.

---

## 27. Antinuke System

**Goal:** detect and auto-punish nuke-style abuse (mass channel/role deletion, dangerous permission grants, bot adds, ban/kick sprees, identity changes, unauthorized webhooks) with safe defaults out of the box — no configuration required to get baseline protection, but everything is tunable.

### Storage — `AntinukeConfigDoc` (`xoxo/database/database.ts`)

Per-guild document with:
- `enabled` (master switch, **default `true`**)
- `log_channel_id` (alerts sent here if set; otherwise falls back to the logging system's mod-log channel if configured)
- `quarantine_role_id` (auto-created on first use if punishment type is `quarantine` and none is set)
- `whitelist: AntinukeWhitelistEntry[]` — `{ type: 'user' | 'role', id }`. The bot itself and the guild owner are always implicitly whitelisted even if not present in this array.
- `modules: Record<string, AntinukeModuleConfig>` — one entry per module: `{ enabled, punishment, threshold: { count, seconds } }`

Relevant CRUD: `getAntinukeConfig`, `setAntinukeEnabled`, `setAntinukeLogChannel`, `setAntinukeQuarantineRole`, `setAntinukeModuleEnabled`, `setAntinukeModulePunishment`, `setAntinukeModuleThreshold`, `addAntinukeWhitelistEntry`, `removeAntinukeWhitelistEntry`, `resetAntinukeConfig`. All auto-create the doc with full module defaults if missing.

### Module registry — `xoxo/config/antinukeModules.ts`

Single source of truth for the 11 modules (channel-create/delete, role-create/delete, dangerous role-update, ban-add, bot-add, mass-member-kick, guild-update/identity-change, emoji-delete, webhook-create). Each has: key, display name, description, default punishment, default threshold (count + seconds window), and alias resolution (`resolveModuleKey(input)`) so `module <name>` accepts loose user input (e.g. `channels`, `chan-create`).

Punishment types: `kick`, `ban`, `strip-roles`, `quarantine`. `resolvePunishmentType(input)` normalizes aliases.

### Engine — `xoxo/helpers/antinukeEngine.ts`

Plain utility module (no class), entry point `checkAntinukeModule(client, guild, moduleKey, actor, opts)`:
1. Loads config; bails immediately if antinuke or the specific module is disabled.
2. `isWhitelisted()` — checks actor against whitelist, bot user, and guild owner.
3. In-memory rate tracking (`Map` keyed by `guild:module:actor`) buffers timestamps within the module's threshold window; only trips once `count` is reached inside `seconds`.
4. On trip: executes punishment (`executePunishment()` — kick/ban/strip-roles/quarantine, auto-creating the quarantine role and locking it out of every channel's permission overwrites on first use), then dispatches a CV2 log embed to the configured log channel.
5. Supports an optional `revert` callback per call site (e.g. recreate a deleted channel/role, unban a banned member) invoked after punishment.

### Hooked events

`channelCreate`, `channelDelete` (+ revert-recreate), `roleCreate`, `roleDelete` (+ revert-recreate), `roleUpdate` (dangerous permission grants), `guildBanAdd` (+ revert-unban), `guildMemberAdd` (bot-add detection via audit log, kicks the adding user), `guildMemberRemove` (mass-kick detection), `guildUpdate` (identity change + revert), `emojiDelete`, and `webhookUpdate` (new file — discord.js has no native webhook create/delete event, so this diffs webhook IDs per channel on the `webhookUpdate` gateway event to infer creation).

### Command — `$antinuke` (`xoxo/commands/antinuke/antinuke.ts`)

Prefix-only, `Administrator` permission required (higher bar than the rest of moderation since this system can ban/kick/strip members and rewrite server structure). See the command table in section 13 for the full subcommand list. `reset` uses the shared confirm-button pattern from `xoxo/components/purgeConfirm.ts` (`buildActionConfirmPayload/buildActionCancelledPayload/buildActionTimedOutPayload`).

### Components — `xoxo/components/antinuke/antinuke.ts`

CV2 builders: status panel (master toggle + module count + log channel + quarantine role summary), modules list, single-module info card, whitelist list, and a help payload. Follows the same architectural rule as the rest of the codebase — no CV2 JSON is assembled inline in the command file.

---

## 28. TypeScript Config

**File:** `tsconfig.json`

| Setting | Value | Reason |
|---|---|---|
| `target` | `ES2022` | Required for top-level await |
| `module` | `Node16` | ESM with proper `.js` extension imports |
| `moduleResolution` | `node16` | Required for Node ESM |
| `outDir` | `./dist` | All compiled output goes here |
| `rootDir` | `./` | Includes root `index.ts` |
| `strict` | `false` | Master off; individual rules toggled |
| `noImplicitAny` | `true` | Enabled |
| `noImplicitThis` | `true` | Enabled |
| `strictNullChecks` | `false` | Disabled — discord.js channel types cause cascading issues |
| `strictPropertyInitialization` | `false` | Disabled — class properties often init in methods |
| `noUnusedLocals` | `false` | Disabled during active development |
| `noImplicitReturns` | `true` | All code paths must return a value |
| `useUnknownInCatchVariables` | `true` | Safer catch variable typing |
| `include` | `["*.ts", "xoxo/**/*"]` | Root + xoxo only |
| `exclude` | `["node_modules", "dist", "reference1"]` | Reference dir is never compiled |

**All imports within `xoxo/` must use `.js` extensions** (TypeScript resolves them to `.ts` at compile time, Node.js uses `.js` at runtime).

---

## 29. Build & Run

```bash
# Build + start (production)
npm run build && npm start

# This compiles TypeScript to dist/ then runs:
# node dist/index.js
```

The Replit workflow is configured as `npm run build && npm start`.

**Build output structure mirrors source structure** — `dist/index.js`, `dist/xoxo/levitate.js`, etc.

**Do not run `ts-node` directly** — the project is ESM and uses Node16 module resolution; the compiled JS files must be run.

---

## 30. Developer Response Rules (Golden Rules)

These rules are **absolute** and apply to every piece of code added or modified in this project. Read before touching anything.

### Rule 0 — Update `grace.md` after every significant batch of changes
Whenever a non-trivial feature is added, a command is modified, or a system is changed, update the relevant sections of this file before finishing. "Significant" means: new command, new system behaviour, changed response format, changed DB interaction, or any architectural decision.

### Rule 1 — No unicode emojis in bot responses
**Never add unicode emojis** (e.g. 🔒, ✅, ⚠️, ⏳) to any bot response — command replies, status messages, confirmation panels, loading messages, etc. If an emoji is needed, it will be requested explicitly. Use the custom emojis from `xoxo/emojis.ts` instead (e.g. `emojis.blacktick`, `emojis.redcross`, `emojis.loading`). The `sendSuccess / sendError / sendInfo / sendLoading` helpers already prepend the correct custom emoji automatically — **do not add any extra emoji on top**.

This applies everywhere: `sendSuccess`, `sendError`, direct `channel.send`, confirmation panels, result strings, audit reasons shown in UI, etc.

### Rule 2 — No plain messages; always use statusMessages or CV2
**Every** bot-visible response must go through one of:
- `sendSuccess(ctx, text)` — for positive outcomes
- `sendError(ctx, text)` — for failures / validation errors
- `sendInfo(ctx, text)` — for neutral information
- `sendLoading(ctx, text)` — for in-progress states
- `sendWrongUsage(ctx, name, usage)` — for usage errors
- `reservedForDeveloper(ctx)` — **must** be used for all developer-only gate rejections (uses `blackcrown` emoji, never `redcross`)
- `blacklistedUser(ctx)` — for blacklisted users
- `blacklistedServer(ctx, guild, client)` — for blacklisted servers
- A hand-built CV2 `ContainerBuilder` payload (for rich panels like confirmations)

**Never** use `channel.send({ content: '...' })`, `message.reply('...')`, or any plain-text send for user-visible output. All status/feedback must be CV2.

**Critical:** When a non-developer invokes a developer-only command, always call `reservedForDeveloper(ctx)` — **never** `sendError`. This applies in `messageCreate` (both prefix and mention-prefix paths) and `interactionCreate` (slash command path). Using `sendError` here is a regression — it shows the wrong emoji (`redcross` instead of `blackcrown`).

### Rule 3 — No specific response layout unless requested
Do not add decorative headers, sections, or layout changes unless explicitly asked. If the user wants a specific message format or layout, they will describe it. Match the existing style of nearby commands.

### Rule 4 — CV2 builders live in `xoxo/components/`, never in command files
Command files (`xoxo/commands/**/*.ts`) must only hold: `options`, data-fetching, collector/session management, and `prefixExecute`/`slashExecute`. All `ContainerBuilder` construction must go in `xoxo/components/<category>/<name>.ts`. This applies to every command, including new ones. See §14 for the subdirectory convention and what to export.

### Rule 5 — Restart the bot after every change
After every build/code change, always run `npm run build` and restart the bot workflow so the user can immediately test the result. Continue doing this for every change until the user **explicitly says** to stop restarting. Never leave a code change sitting undeployed.

### Rule 6 — One non-developer command inventory
The prefix loader, help menu, and website must expose the same set of non-developer
command names. The repository check `npm run check:command-parity` compares the
source command metadata with the website catalog; command subcommands may be listed
as documentation rows, but they count once by their base command name.

---

## 31. Common Gotchas & Non-Obvious Rules

### Mobile status can only be set at IDENTIFY time
Setting `identifyProperties` after `super()` in the Client constructor does not work in current discord.js/@discordjs/ws versions. It must be injected via `ws.buildStrategy` in the constructor options, which wraps `SimpleShardingStrategy`. This was a critical bug that was fixed.

### The `client` arg is injected by the event loader, not discord.js
Event handlers receive `(...args, client)` where the last arg is always the `LevitateClient`. This is injected by the event loader. Do not try to get the client from within the event by any other means.

### `message.commandRawArgs` for newlines
Commands that need to preserve exact whitespace and newlines (say, note, AFK) must read from `message.commandRawArgs` instead of `args.join(' ')`. The event loader sets this to the full string after the command name token, preserving actual newlines.

### `MessageFlags.IsComponentsV2` on every CV2 payload
Without this flag, Discord rejects the message. It must be present on every `components` payload that uses CV2 builders.

### Sticky updates run for ALL messages including bot messages
The `updateSticky(client, message)` call in `messageCreate` happens before the bot-filter check. This is intentional: the sticky must re-post even when the bot itself sends a message, otherwise the sticky would get "buried" by the bot's own responses.

### `$stop-bot` on Pterodactyl-style panels (Nex Cloud / Wispbyte / Aerox Devs)
These panels run a crash-detection watchdog that force-restarts the container on almost any process exit it didn't itself trigger via the panel's own Stop action — `process.exit(0)` from `$stop-bot` looks identical to a crash, so the watchdog respawns the whole process and it looks like `$stop-bot` "restarted" the bot instead of stopping it.
Mitigation: `$stop-bot` writes a `dist/.stop-flag` marker file (on both the manager and, best-effort, via `evalOnManager`) right before calling `process.exit(0)`. `index.ts` checks for that file at the very top, before spawning any clusters — if present, it deletes the flag and exits immediately without touching Discord. This doesn't stop the host from restarting the OS process, but it does keep the bot itself offline rather than fully reconnecting. If the panel's crash-detection is still bringing it fully back online, check the panel's "Auto Restart" / crash-detection settings — that's a host-config problem no amount of in-app code can fully solve.

### Slash command registration is global and happens at every boot
`registerSlashCommands` is called at every startup. Discord de-duplicates by name, but if you rename or remove a command you may need to wait for Discord's global propagation (up to 1 hour) before the change is visible to all users.

### Saved data payloads are stored as file attachments, not DB documents
The DB only stores the message ID pointing to the attachment. Always fetch the attachment from `config.savedDataChannelId` before using the payload. If the storage message is deleted, the saved data is effectively broken.

### `guild.members.fetch()` (no args) requires Server Members privileged intent
Any command that fetches **all** members at once — `massnick`, `role all`, `membercount` — calls `guild.members.fetch()` with no arguments. This requires the **Server Members** privileged intent to be enabled in the **Discord Developer Portal** (Bot → Privileged Gateway Intents), not just in code. If it is not enabled in the portal, the call throws and the bot falls back to `guild.members.cache` (cached members only — may be a subset). Individual-member fetches (`guild.members.fetch(userId)`) are unaffected.

### `guild.members.fetch()` (no args) requires Server Members privileged intent
Any command that fetches **all** members at once — `massnick`, `role all`, `membercount` — calls `guild.members.fetch()` with no arguments. This requires the **Server Members** privileged intent to be enabled in the **Discord Developer Portal** (Bot → Privileged Gateway Intents), not just in code. If it is not enabled in the portal, the call throws and the bot falls back to `guild.members.cache` (cached members only — may be a subset). Individual-member fetches (`guild.members.fetch(userId)`) are unaffected.

### `"mobile"` in displayStatus array — device icon is decided at boot
If you put `"mobile"` anywhere in a `displayStatus` array, the mobile device icon is installed only if `"mobile"` is the **first** value, because it's set at IDENTIFY time. Rotating to `"mobile"` later in a rotation array won't give the phone icon mid-session.

### No `console.log` in `LevitateClient` constructor
The constructor is intentionally silent. All startup logging is controlled by `levitate.ts`.

### Webhook logger emojis must be from the same server as the webhook channels
Webhooks cannot use emojis from other servers or Application Emojis. Update `logEmojis` in `webhookLogger.ts` if the webhook channels move to a different server.

### `db` is `undefined` until `initDatabase` completes
Any code that runs before step 6 of the boot sequence must not access `client.db`. Commands must always guard: `if (!client.db) return sendError(...)`.

### `excludedCategories` in `categories.ts` hides commands completely
Commands in `developer` and `developerinfo` categories are not counted, not listed, and not selectable in the help menu. If you create a new dev-only category, add it here.

### `ROTATION_INTERVAL_MS` is shared by all rotators
All three rotators (displayStatus, status, presence) tick at the same 10-second interval. They are independent timers but share the constant. Changing it affects all of them.

### Debug CPU reading may be faked
If the real CPU measurement returns 0% (common in containerized environments), `debugConfig.enableCpuFallback` causes a fake value in [3.0%, 5.0%] to be shown instead, marked with `*(est.)*`.

---

## 32. Birthday System

**Files:** `xoxo/commands/birthday/birthday.ts`, `xoxo/components/birthday/birthday.ts`, `xoxo/components/birthday/birthdaySender.ts`, `xoxo/helpers/parseBirthdayDate.ts`, `xoxo/helpers/birthdayScheduler.ts`

### Storage

- **`birthdays` collection** (`BirthdayDoc`) — `{ user_id, day, month, year: number|null, updated_at }`. One document per user, keyed by `user_id` only — a birthday is **global**, not per-guild. `year` is optional (used only for display; not required to set a birthday).
- **`birthday_settings` collection** (`BirthdaySettingsDoc`) — `{ guild_id, channel_id, message_text, message_data, updated_at }`. Per-guild announcement config, structurally identical to `greet_settings`.
- **`birthday_announcements` collection** (`BirthdayAnnouncementDoc`) — `{ guild_id, user_id, year, sent_at }` with a **unique index** on `(guild_id, user_id, year)`. `claimBirthdayAnnouncement()` claims the slot via a raw `insertOne` — the duplicate-key error IS the concurrency guard, so overlapping scheduler ticks / restarts / multi-process races can never double-announce. If the actual send fails, `releaseBirthdayAnnouncement()` deletes the claim so the next tick retries instead of silently giving up on that birthday for the year.

### Command — `$birthday` (aliases `bday`, `bd`)

Single command, subcommand-routed (same pattern as `$log`/`$antinuke`), rather than split into sibling commands like the welcomer family:
- `birthday` (no args) — CV2 settings panel: server's channel/message config + the invoker's own birthday.
- `birthday set <date>` — parses the date via `parseBirthdayDate()` (see below) and upserts it for the invoker. No permission required.
- `birthday unset` — removes the invoker's birthday. No permission required.
- `birthday list` — CV2 panel listing birthdays of members currently in the guild (fetches full member list, falls back to cache on failure), sorted by soonest upcoming date. Visible to everyone.
- `birthday channel set <#channel>` / `birthday channel remove` — ManageGuild only.
- `birthday message set <text> [data: <name>]` / `birthday message remove` — ManageGuild only; same `[data: <name>]` saved-data suffix syntax and emoji parsing as `$greet-message`.

### Date parsing — `parseBirthdayDate(input)`

Accepts, in order: ISO `YYYY-MM-DD`; numeric `DD/MM` or `DD/MM/YYYY` (also `-`/`.` separators, day-first); `DD Month[, YYYY]` (e.g. `15 April 2000`, ordinal suffixes like `15th` allowed); `Month DD[, YYYY]` (e.g. `April 15, 2000`). Returns `{ day, month, year }` or `null`. Validity is checked by round-tripping through `Date` (rejects e.g. `31 February`); a leap year is used as the implicit test year when no year is given so `Feb 29` is always accepted. `formatBirthday(day, month, year?)` renders it back for display.

### Sending — `sendBirthdayMessage(member, client)` (`birthdaySender.ts`)

Mirrors `greetSender.ts`'s dispatch logic (message/embed/cv2 saved-data merge with `message_text`), minus the bot-skip logic (bots don't have birthdays). Falls back to `DEFAULT_BIRTHDAY_MESSAGE` (`"Happy Birthday, ${user_mention}! Hope your day is amazing."`) when no `message_text` is configured. The internal saved-data dispatcher returns whether a message was actually delivered; `sendBirthdayMessage` propagates that truthfully — it only returns `{ sent: true }` when something was actually delivered to Discord, and `{ sent: false, reason }` otherwise (no channel configured, channel gone, missing permissions, broken saved data, etc.). The scheduler relies on this being truthful for its retry logic (see below).

### Scheduler — `birthdayScheduler.ts` (loaded as a helper)

A top-level `xoxo/helpers/` file with a default-export factory, so it is picked up automatically by `helperLoader` and runs on **every cluster process** (each process only has the guilds/members it owns cached). On load it schedules:
- An initial run after 30s (lets member caches warm up post-boot).
- A recurring run every 15 minutes.

Each run uses UTC month/day (`getUTCMonth`/`getUTCDate`) to find today's birthdays via `getBirthdaysByMonthDay`, then for every guild this process has cached — skips guilds with no `channel_id` configured, resolves the member (cache, else individual `fetch`), **atomically claims** the announcement slot via `db.claimBirthdayAnnouncement(guildId, userId, year)` (skips if already claimed — i.e. already announced this year), sends via `sendBirthdayMessage`, and — only if the send actually failed — calls `db.releaseBirthdayAnnouncement()` so the next tick retries instead of permanently giving up for the year. There is no cross-cluster coordination needed: each cluster only ever sees its own guilds, so no duplicate work happens across processes; the unique DB index protects against any residual races.

`birthday list`'s "in N days" / "Today!" countdown (`daysUntilNext` in `components/birthday/birthday.ts`) is computed in **UTC**, matching the scheduler's UTC month/day basis, so what the list shows as "Today!" is consistent with when the scheduler will actually announce it.


## 33. Vanity Role System

Automatic role assignment based on two independent per-guild triggers. Config stored in the `vanity_role_settings` MongoDB collection.

### Document shape (`VanityRoleSettingsDoc`)

| Field | Type | Notes |
|---|---|---|
| `guild_id` | string | PK |
| `status_enabled` | boolean | `false` = paused; **undefined treated as `true`** at runtime — always guard with `=== false` |
| `status_keyword` | string? | case-insensitive substring matched anywhere in custom status |
| `status_role_id` | string? | role to give/remove |
| `status_message_text` | string? | plain-text part of gain message |
| `status_message_data` | string? | saved-data entry name |
| `tag_enabled` | boolean | same `=== false` rule |
| `tag_role_id` | string? | role for server-tag trigger |
| `tag_message_text` | string? | plain-text part of tag gain message |
| `tag_message_data` | string? | saved-data entry name |
| `message_channel_id` | string? | shared announcement channel for both triggers |
| `updated_at` | Date | |

DB methods: `getVanityRoleSettings`, `setVanityRoleStatusConfig`, `setVanityRoleTagConfig`, `setVanityRoleMessageChannel`. All upsert; `$setOnInsert` via `vanityRoleDefaults()`.

### Status trigger (`presenceUpdate` event)

File: `xoxo/events/discord/presenceUpdate.ts`

Requires **GuildPresences** privileged intent (already in `LevitateClient.ts` — must also be toggled on in the Discord Developer Portal or the event never fires).

- Guard: `status_enabled === false` (NOT `!value` — undefined = enabled).
- Member resolved via `newPresence.userId`, not `.member` (which can be null for uncached members).
- Keyword matched with `.includes(keyword.toLowerCase())` against `activity.state` — substring, so `/paradise` matches `discord.gg/paradise`.
- Role added on match; removed when keyword no longer present.

### Server tag trigger (`guildMemberUpdate` extension)

File: `xoxo/events/discord/guildMemberUpdate.ts` — `handleServerTagRole()`.

```
const SERVER_TAG_FLAG = 1 << 15; // 32768 — not yet a named constant in this discord-api-types version
```

Guard: `tag_enabled === false`. Compares `oldMember.flags.bitfield` vs `newMember.flags.bitfield` on the SERVER_TAG_FLAG bit. If Discord changes this bit in a future API revision, this constant is the only value to update.

**Tag panel is blocked unless `guild.features.includes('CLAN')`** — checked in the command before showing the panel.

### Message dispatcher

File: `xoxo/components/utility/vanityRoleSender.ts`

Mirrors `greetSender.ts`. Skips silently if `message_channel_id` is null. Supports `message`, `embed`, and `cv2` saved-data types with text prepend and placeholder resolution via `resolvePlaceholders`.

### Interactive panels

Files:
- `xoxo/components/utility/vanityrole.ts` — panel builders + session + interaction handler
- `xoxo/commands/utility/vanityrole.ts` — command entry point
- `xoxo/events/discord/interactionCreate.ts` — routes `vr:` and `vr-modal:` to `handleVanityRoleInteraction`
- `xoxo/slashCommands/utility/vanityrole.ts` — slash builder

**Command:** `$vanityrole` / `$vanityrole status` / `$vanityrole bio` opens the status panel. `$vanityrole tag` checks for CLAN feature then opens the tag panel.

**Session model (mirrors namestyle.ts):**
- `scopeId` = the invoking command message ID (known before sending, embedded in all customIds)
- Session Map key = `scopeId`; stores `botMsgId` (the bot's reply) for modal-submit panel edits
- Timeout: 10 min inactivity → all components disabled

**CustomId scheme:**

```
vr:keyword:<scopeId>              — Set Keyword button (status panel only)
vr:msg:<trigger>:<scopeId>        — Set Message button
vr:clrmsg:<trigger>:<scopeId>     — Clear Message button
vr:role:<trigger>:<scopeId>       — RoleSelectMenu
vr:chan:<scopeId>                  — ChannelSelectMenu (shared between triggers)
vr:toggle:<trigger>:<scopeId>     — Enable/Disable toggle button
vr-modal:keyword:<scopeId>        — keyword modal submit
vr-modal:msg:<trigger>:<scopeId>  — message modal submit
```

`parseScopeId()` always takes the last `:` segment — works for all ID shapes because Discord snowflakes contain no colons.

**Modal submit flow:** `deferReply(ephemeral)` → validate inputs → save to DB → fetch `session.botMsgId` → `msg.edit(newPanel)` → `deleteReply()`. Panel updates in place with no visible confirmation flash.

**Panel components (status panel):** 4 ActionRows — [Set Keyword | Set Message | Clear Message | Enable/Disable toggle], [RoleSelectMenu], [ChannelSelectMenu]. Tag panel omits Set Keyword, leaving 3 ActionRows.

### Key gotchas

- `=== false` not `!value` for both enabled flags — `undefined` means enabled in pre-existing docs that predate the field.
- `message_channel_id` is shared between both triggers. No channel = no message, even if text is set.
- SERVER_TAG_FLAG = 32768 is undocumented in this discord-api-types version. If the tag trigger never fires, inspect the raw `GUILD_MEMBER_UPDATE` gateway payload to verify the bit value.
- GuildPresences intent must be toggled on in the Discord Developer Portal — the intent declaration in code alone is not enough.

---

## 34. Autoresponder System

Per-guild keyword triggers that automatically send a message and/or add a reaction when a matching word/phrase is said. Requires **Manage Server** permission to configure.

### Storage — `AutoresponderDoc` (`xoxo/database/database.ts`)

| Field | Type | Notes |
|---|---|---|
| `guild_id` | string | |
| `ar_id` | string | Stable 8-char alphanumeric short ID, globally unique across all guilds; shown in panels and info views |
| `trigger` | string | Original-case, shown in panels |
| `trigger_lower` | string | Lowercased — matching + uniqueness key; unique index on `(guild_id, trigger_lower)` |
| `match_type` | `'exact' \| 'anywhere'` | See matching rules below |
| `responses` | `{ type: 'message' \| 'reaction'; content: string; replyMode?: 'normal' \| 'reply_mention' \| 'reply_no_mention' }[]` | Up to 5, fired in order; `replyMode` applies to `message` responses only |
| `enabled` | boolean | |
| `is_global` | boolean | When true, trigger fires in ALL guilds (not just the owning one) |
| `created_by` / `created_at` / `updated_at` | | |

Caps: **25 triggers per guild**, **5 responses per trigger**. Both enforced at the DB layer — trigger uniqueness/limit via a unique Mongo index (race-safe insert, catches `E11000` → `'duplicate'`), and the response cap via an atomic aggregation-pipeline `$push` that only appends when `$size < 5` (concurrency-safe, unlike a naive read-then-push).

New DB helpers: `getAutoresponderById(arId)` (global lookup by ar_id), `getAllAutorespondersAcrossGuilds()` (all docs sorted by created_at), `getGlobalAutoresponders()` (all is_global=true docs, indexed on `is_global`), `setAutoresponderGlobal(arId, isGlobal)`.

### Matching rules (`xoxo/helpers/autoresponderMatcher.ts`)

- **`exact`** — the trimmed message must equal the trigger exactly (case-insensitive).
- **`anywhere`** — the trigger must appear as a whole word/phrase among the message's whitespace-split tokens (case-insensitive). This is a **token match, not a substring match**: punctuation attached to a token breaks the match, and partial words never match.
  - Trigger `cat`: matches `"this is a cat"`, `"cat"`, `"what is a cat"`. Does **not** match `"catsy"`, `"cat?"`, `"cats"`.

### Dispatch (`xoxo/helpers/autoresponderDispatch.ts`)

Hooked into `messageCreate.ts` as a fire-and-forget call (`dispatchAutoresponders(...).catch(...)`), right after the bot/DM guard. For every enabled, matching trigger in the guild, responses fire in stored order — `message` sends plain text with configurable reply mode (see below), `reaction` reacts to the triggering message. After processing native guild triggers, the dispatcher also checks all `is_global=true` triggers from **other guilds** (additive only — never double-fires a trigger that was already handled natively). A per-`guild:channel:trigger` 3-second cooldown (in-memory `Map`, swept every 60s) prevents rapid repeats.

**Reply modes** (for `message` responses, set per-response via a StringSelectMenu step in the Add Message flow):
- `normal` (default) — `channel.send(...)` with `allowedMentions: { parse: [] }`
- `reply_mention` — `message.reply(...)` with `allowedMentions: { repliedUser: true }`
- `reply_no_mention` — `message.reply(...)` with `allowedMentions: { repliedUser: false, parse: [] }`

### Command — `$autoresponder` (`xoxo/commands/utility/autoresponder.ts`, aliases `ar`, `autores`, `autoresponders`)

- **(no args)** — **interactive paged home panel**: shows triggers 6 per page with a StringSelectMenu to open the manage panel for any trigger, Prev/Next page buttons, and a **Create New** button (opens a modal for the trigger text, then transitions to the manage panel in-place). No need to type the trigger as a command argument.
- `add <trigger>` — creates the trigger (defaults to `anywhere` match) then opens the manage panel
- `edit <trigger>` — opens the manage panel for an existing trigger
- `info <trigger>` — static detail view (shows `ar_id` and `is_global` flag)
- `list [page]` — paginated static list of every trigger (shows `ar_id` per row)
- `remove <trigger>` / `toggle <trigger>` (`enable`/`disable` variants) — direct one-shot actions
- `help` — same as home panel

### Manage panel (`xoxo/components/utility/autoresponder.ts`)

Self-contained collector + local modal-submit listener — mirrors `container.ts`'s pattern (no global `interactionCreate` routing needed). CustomIds scoped with a `<messageId>-<timestamp>` token suffix. Components: match-type select, remove-response select (when responses exist), Add Message / Add Reaction / Toggle / Delete Trigger / **Back** (returns to home panel in-place, shown when entered from home) / Done buttons. The header shows `-# ID: \`<ar_id>\`` for easy reference.

**Add Message flow**: after the text modal, a StringSelectMenu step asks for delivery mode (normal / reply with ping / reply without ping); the choice is persisted as `replyMode` on the response object. Response lines in the panel show the mode when non-default, e.g. `Message (reply, no ping) — ...`.

### Developer command — `$global-ar` (`xoxo/commands/developer/global-ar.ts`, `owner: true`, aliases `gar`, `globalar`)

Companion component: `xoxo/components/developer/global-ar.ts`. Lists every autoresponder trigger across every guild in a paginated panel (20 per page). Each option label shows `<trigger> — <guild name> (<ar_id>)` to disambiguate cross-guild triggers. Pre-selects options where `is_global=true`. Multi-select (minValues 0, maxValues = page size) — changing the selection immediately diffs the previous page state and calls `setAutoresponderGlobal` for any changed ar_ids, then re-renders with a brief inline confirmation (`-# Updated N trigger(s)`). 10-minute timeout. Gated via `owner: true` (enforced by the `messageCreate` handler before `prefixExecute`).

### Key gotchas

- `anywhere` is a whole-token match, not `.includes()` — do not "simplify" it to a substring check, that would break the `cats`/`catsy`/`cat?` non-match requirement.
- Response-cap and duplicate-trigger enforcement rely on the Mongo unique index and the aggregation-pipeline `$push`, respectively — a plain `find`-then-`insert`/`push` reintroduces a race condition under concurrent panel use.
- `addAutoresponderResponse` confirms the push succeeded by re-reading the doc afterward (the pipeline update silently no-ops when the cap is already hit) — callers must check the boolean return, not assume success.
- `ar_id` is generated with a crypto.randomBytes-based local helper (no new npm deps) and checked for global uniqueness with a retry loop; a unique Mongo index on `ar_id` prevents races.
- Global dispatch is additive only — a trigger native to the current guild is always processed first and its `trigger_lower` is tracked; global-foreign docs with the same trigger text won't double-fire.

---

## 36. Stats API — Bot ↔ Website

The bot runs a lightweight HTTP server on cluster 0. The Levitate-Web Vercel function (`api/stats.js`) queries MongoDB directly rather than polling the bot server — no bot-side HTTP server is required for the production website.

The original bot-side stats server design (described below) is retained for reference and for future direct-polling setups.

### Bot env vars (set on bot host, optional)
| Var | Default | Purpose |
|---|---|---|
| `STATS_API_PORT` | `3001` | Port the stats server listens on — expose publicly on your host |
| `STATS_API_SECRET` | *(empty)* | Optional bearer token; leave blank for a public endpoint |

### Website env vars (Vercel, optional — only needed if using direct bot-polling instead of Vercel DB route)
| Var | Example | Purpose |
|---|---|---|
| `VITE_STATS_API_URL` | `https://mybot.host.com` | Public base URL of the bot's stats server (no trailing slash) |
| `VITE_STATS_API_SECRET` | *(empty)* | Must match `STATS_API_SECRET` on the bot if set |

The endpoint is `GET <VITE_STATS_API_URL>/api/stats`. The Stats page shows "Not configured" if the var is missing and "Bot Offline" if the request fails.

---

## 37. Lavalink Node Management

### Architecture

The bot uses **sequential single-active-node failover** via `xoxo/helpers/nodeManager.ts`. Only ONE Lavalink node is ever connected at a time. If that node proves unhealthy the manager automatically tries the next one in priority order.

This replaces the old "add all nodes at once" approach which caused Shoukaku's internal reconnect loop to spam the console with repeated `[NODE] 💀 ... closed. Code: 1006` messages — one per reconnect attempt, forever, with no backoff.

### Priority order (best → fallback)

| Priority | Name | Host | Secure |
|---|---|---|---|
| 1 | Serenetia | `lavalinkv4.serenetia.com:443` | Yes |
| 2 | Jirayu | `lavalink.jirayu.net:13592` | No |

HeavenCloud was removed — it was unreliable and the spam originated from it being in the list alongside Jirayu.

### How failover works

1. At boot `connectLavalinkNodes()` calls `startNodeManager(client, nodes)` in `nodeManager.ts`.
2. The manager calls `shoukaku.addNode()` for only the first node (Serenetia).
3. Every `close` and `error` event on that node calls `reportNodeFailure(client, nodeName)`.
4. After **3 failures within 20 seconds**, the manager:
   - Overwrites `node.connect = async () => {}` (no-op) to kill Shoukaku's built-in reconnect loop.
   - Calls `shoukaku.removeNode(name)` to drop it from the pool.
   - Calls `shoukaku.addNode()` for the next node in the list.
5. Once all nodes have been tried, it waits **30 seconds** then restarts from the top of the list.
6. When a node emits `ready`, `reportNodeReady(nodeName)` resets its failure counter.

### Key constants (in `nodeManager.ts`)

| Constant | Value | Meaning |
|---|---|---|
| `UNHEALTHY_FAILURE_COUNT` | 3 | Failures within the window before failover |
| `UNHEALTHY_WINDOW_MS` | 20 000 ms | Window to count failures in |
| `WRAP_AROUND_COOLDOWN_MS` | 30 000 ms | Pause before retrying from top of list |

### Node event files (`xoxo/events/node/`)

| File | Shoukaku event | What it does |
|---|---|---|
| `nodeConnect.ts` | `ready` | Calls `reportNodeReady` + `clearNodeSilence`, logs connect/resume, triggers 24/7 boot restore (`reconnectAllOnBoot`) **and** mid-session node-recovery restore (`reconnectAfterNodeRecover`) |
| `nodeDestroy.ts` | `close` | Calls `reportNodeFailure` — only logs if no failover was triggered |
| `nodeError.ts` | `error` | Calls `reportNodeFailure` — only logs if no failover was triggered and the error code is new |
| `nodeDisconnect.ts` | `disconnect` | Calls `reportNodeGaveUp` (immediate failover) for connection-lost; logs silently for player-move |
| `nodeCreate.ts` | `nodeCreate` | Structural stub — this Shoukaku event never fires |
| `nodeReconnect.ts` | `nodeReconnect` | Structural stub — Shoukaku uses `ready(resumed=true)` instead |

### Developer command

`$node-status` (`nodestatus`, `ns`) — developer-only (`owner: true`), category `info`. Shows which node is currently connected in Shoukaku's pool and which node the manager is targeting, plus the full configured priority list.

---

## 38. Music & 24/7 System

### Overview

Music is powered by **Kazagumo v3** (queue / player abstraction) over **Shoukaku v4** (Lavalink WebSocket layer). The Lavalink REST / WS backend is managed by the node manager (§37).

All music commands live in `xoxo/commands/music/` with `category: 'music'`. Source search goes through `xoxo/helpers/sourceSearch.ts` (`unifiedSearch`), which tries LavaSrc Spotify → fallback YouTube search → indirect Spotify → other sources in sequence.

### Player Lifecycle

| Kazagumo event | Handler file | What it does |
|---|---|---|
| `playerStart` | `trackStart.ts` | Sends/updates the now-playing message, sets voice status |
| `playerEnd` | `trackEnd.ts` | Starts inactivity timer (guarded — skips if 24/7 enabled) |
| `playerEmpty` | `queueEnd.ts` | Disables NP buttons, sends queue-end notice; if 24/7 and in right channel stays connected; if 24/7 and wrong channel schedules rejoin (2 min) |
| `playerDestroy` | `playerDisconnect.ts` | Clears player state, rejoin timer, and session state |
| `playerResumed` | `playerMove.ts` | Logs node migration (no action needed) |

### Duration Handling

`KazagumoTrack.length` is set from `raw.info.length` (ms, from Lavalink) at search time. For tracks that undergo lazy resolution (e.g. Spotify passthrough → YouTube fallback), `track.length` may be updated by `track.resolve()` when playback begins — meaning the value at search time can differ slightly from the value once playing.

**In `nowPlayingManager.ts`'s `buildTrackInfo`:** the authoritative length is pulled from `player.shoukaku?.track?.info?.length` (the active Lavalink track, post-resolution) and falls back to `track.length` only if Shoukaku's value is absent. This ensures the now-playing display always shows the Lavalink-confirmed duration, not the search-estimate.

**Auto-update interval:** `sendNowPlayingMessage` starts a `setInterval` (10 s, stored in the module-level `updateIntervals` map keyed by guildId) that calls `updateNowPlayingMessage` on each tick. The interval is stopped by `clearPlayerState` (track end / player destroy) and `disableNowPlayingButtons` (queue end / stop). Only one interval runs per guild at a time — starting a new one always cancels the previous via `stopUpdateInterval`.

**In `addedToQueue` messages** (`play.ts`, `add.ts`): duration comes from `track.length` at search time (before resolution). For direct YouTube/SoundCloud tracks these match; for indirect Spotify resolves there may be a small discrepancy. This is a known limitation — editing the "added to queue" message post-resolution is not implemented.

### 24/7 Mode (`$24/7`)

Configuration stored per-guild in MongoDB via `client.db.get24Seven(guildId)` / `client.db.set24Seven(guildId, data)` / `client.db.getAllEnabled24Seven()`. Fields: `enabled` (boolean), `channelId` (string).

Helper: `xoxo/helpers/twentyFourSeven.ts`

| Export | Purpose |
|---|---|
| `scheduleRejoin(client, guildId, channelId, delayMs)` | Cancels any pending rejoin, then sets a new timeout calling `performRejoin` |
| `clearRejoin(guildId)` | Cancels the pending rejoin timer for a guild |
| `reconnectAllOnBoot(client)` | Restores all 24/7 connections on first node-ready event (once-per-process guard) |
| `reconnectAfterNodeRecover(client)` | Restores 24/7 connections after a mid-session node failure (no once-guard; called on every node-ready) |

**`performRejoin` (internal):** checks guild/channel existence and Connect+Speak permissions before calling `createPlayer`. Retries up to 3× with exponential backoff (30s → 60s → 120s) on failure.

### 24/7 Reconnect Flow

1. **Bot kicked from VC:** Discord fires `voiceStateUpdate` → handler destroys existing player (fires `playerDestroy` / `clearRejoin`) → handler calls `scheduleRejoin(2000)` → bot rejoins in 2 s.
2. **`$stop` with 24/7 enabled:** stops the queue and calls `player.stop()` — does **not** destroy the player or disconnect from VC. Bot stays in the 24/7 channel idle. User must `$24/7 disable` then `$stop` to fully disconnect.
3. **Lavalink node failure:** Shoukaku destroys all players internally; no `voiceStateUpdate` fires. When the node manager connects a new node, `nodeConnect.ts` calls `reconnectAfterNodeRecover` which recreates players for every enabled 24/7 guild. Without this, 24/7 connections are permanently lost until restart.
4. **Bot moved to wrong channel while idle:** `voiceStateUpdate` detects the mismatch → `scheduleRejoin(3000)`.
5. **Bot moved to wrong channel while playing:** 24/7 guard is in `queueEnd.ts` — when the queue ends and `player.voiceId !== is247.channelId`, a rejoin is scheduled (2 min delay to allow the current track to finish naturally).

### `$stop` Behaviour

With 24/7 enabled: clears queue + `player.stop()` → stays in VC. Info message shown explaining the mode.
Without 24/7: `player.destroy()` → disconnects. Alias `$dc` only (the `disconnect` alias was removed to avoid collision with `vcControls/disconnect.ts`).

---

## 39. Developer Notes & Conventions

- **Never change `displayStatus` in `botInstances.ts` unless explicitly asked to.** This value is managed by the bot owner.
- **`Levitate-Web/` is a fully separate project.** It must never share files or imports with the bot codebase. Keep the two completely decoupled — no cross-directory imports. Its website themes are defined in `Levitate-Web/src/config/themes.ts`; decorative artwork and sticker effects must consume theme CSS variables rather than hard-coded palette values, and Discord marks must remain visible on light themes.
- **Every command category must contain ≥2 commands.** Single-command categories are not permitted. The `autoresponder/` category currently contains one entry and should grow as needed.
- **CV2 builders belong in `xoxo/components/`, not in command files.** See §14 for the full rule. Exception: pure `ButtonStyle.Link` rows (no customId, no interaction handler) may remain inline in the command file since they carry no interaction state.
