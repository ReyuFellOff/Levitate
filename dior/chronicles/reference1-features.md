# Reference1 Bot — Copyable Features

> **Bot name:** TorqueSecurity (internally "Karen")  
> **Source:** `reference1/`  
> **Language:** JavaScript (discord.js v14, CV2-native)  
> **Already implemented in Cassie and therefore skipped:** ban, kick, timeout/mute, unban, nick, purge, role add/remove, lock/unlock, setprefix, blacklist (user + server), noprefix, antinuke core, whitelist, quarantine-role config.

Everything below is **not currently in Cassie** or is a meaningful upgrade over what Cassie has.

---

## 1. Automod System (`$automod`)

A complete real-time message filtering system with a 4-page interactive config dashboard. Requires a new `automod` MongoDB collection.

### Four modules

| Module | What it does | Configurable |
|---|---|---|
| **Anti-Link** | Blocks any URL not in a safe-domain or allowed-domain list. Safe defaults: `tenor.com`, `giphy.com`, `cdn.discordapp.com`, `media.discordapp.net`. Invite domains are always blocked regardless. | Whitelist roles + channels (up to 15 each); add/clear custom allowed domains (up to 15) |
| **Anti-Invite** | Detects `discord.gg`, `dsc.gg`, `dis.gd`, `discord.com/invite` patterns; fetches the invite to confirm it's a *different* server (own server invites + own vanity are allowed). | Whitelist roles + channels |
| **Anti-Spam** | Per-user message rate tracking in a sliding time window. Default: 5 msgs / 5 s. Window and threshold adjustable via buttons (threshold 2–20, window 2–30 s). | Whitelist roles + channels; threshold + window |
| **Anti-Mention** | Counts users + roles + `@everyone`/`@here` per message and across a 10-second bucket. Default limit: 5. | Whitelist roles + channels; limit 2–50 |

### Global punishment (applies to all modules together)
Options: `Warn` (DM notification), `Mute` (10-min timeout), `Kick`, `Ban`, `None` (delete-only).

### Config bypass
- Server owner and Administrator-permissioned members are never flagged.
- Any whitelisted role or whitelisted channel skips that specific module.

### Dashboard UI
`$automod` opens a 4-page CV2 panel (one page per module). Each page has:
- Status line + current whitelist counts + current threshold (where applicable)
- RoleSelectMenu to toggle whitelist roles
- ChannelSelectMenu to toggle whitelist channels
- Increment/decrement buttons for numeric settings (Anti-Spam threshold, window; Anti-Mention limit)
- Global punishment StringSelectMenu on every page
- Prev / Page N of 4 / Next navigation
- Save + Discard buttons

`$automod view` shows a read-only overview of all four modules with their current state.  
`$automod reset` wipes the guild's automod config entirely.

### DB schema
```
automod collection:
  guildid: String (primary key)
  punishment: "warn" | "mute" | "kick" | "ban" | "none"
  antilink:   { enabled, wlrole[], wlchannel[], allowedlink[] }
  antiinvite: { enabled, wlrole[], wlchannel[] }
  antispam:   { enabled, threshold, window, wlrole[], wlchannel[] }
  antimention:{ enabled, threshold, wlrole[], wlchannel[] }
```

### Implementation notes
- Automod runs as a `checker(message)` function called from `messageCreate` before command routing.
- Each module's violation handling: delete message → apply punishment → send a 6-second channel notice mentioning the author.
- Spam and mention tracking use in-memory `Map` buckets (no DB hit per message). Buckets are per-guild, per-user.
- Anti-Spam clears the bucket on trigger (resets count after punishment so a single burst only punishes once).
- Anti-Mention uses a 10-second rolling bucket across messages, not per-message count.

---

## 2. Autorole (`$autorole`)

Auto-assigns up to 10 roles to every new member who joins the server. Dangerous roles (Administrator, ManageGuild, ManageRoles, BanMembers, KickMembers, ManageWebhooks, ManageChannels) are silently rejected from selection at both setup time and confirm time.

### Subcommands
| Subcommand | What it does |
|---|---|
| `set` | Opens an interactive CV2 panel with a RoleSelectMenu (up to 10 roles). Confirm/Clear/Cancel buttons. Shows selected roles live as you pick. Saves on confirm. |
| `list` | Displays currently saved roles with mention + ID + enabled status. |
| `enable` / `disable` | Toggles the system without clearing the role list. |
| `reset` / `clear` | Removes all saved roles. |

### DB schema
```
autorole collection:
  _id: guildId
  roles: String[]   (role IDs)
  enabled: Boolean
```

### Event hook
`guildMemberAdd` → fetch autorole doc → assign each saved role (skip if bot doesn't have ManageRoles or role is above bot's highest role).

### Implementation notes
- Rejected roles get an ephemeral warning listing exactly which dangerous permissions caused the rejection.
- Only Administrator-permissioned members (or Extra Owners) can configure autorole.
- `guildMemberAdd` already exists in Cassie (for welcomer) — autorole logic goes in the same event handler.

---

## 3. Snipe (`$snipe`)

Recalls deleted messages from the current server. Stored in SQLite (`snipes` table), max 50 entries per guild (oldest auto-trimmed on insert).

### Usage
- `$snipe` — shows the most recently deleted message guild-wide (paginated, up to 30).
- `$snipe user @user` — filters to a specific user's deleted messages.

### What it shows (per snipe)
- Author display name + user ID (thumbnail avatar)
- Channel mention
- Deletion timestamp (relative + absolute Discord timestamp)
- Full message content (truncated at 1800 chars)
- Attachment URL footnote if an image/file was attached

### CV2 panel
- Section with avatar thumbnail on the right
- Prev `‹` / Next `›` / Jump to Latest `!` button row
- Page N / Total counter in footer
- All buttons disabled on collector end (90s idle, 30s active)

### SQLite schema
```sql
CREATE TABLE snipes (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  guildId     TEXT NOT NULL,
  channelId   TEXT,
  content     TEXT,
  author      TEXT,
  authorId    TEXT,
  authorAvatar TEXT,
  timestamp   INTEGER NOT NULL,
  imageUrl    TEXT
);
```

### Event hook
`messageDelete` event → insert row → trim to 50 per guild. Skips bots. Handles partials (attempts fetch before giving up).

### Implementation notes
- Requires `better-sqlite3` (synchronous SQLite). Cassie currently uses MongoDB only — this would be a new dependency.
- Alternatively: store snipes in MongoDB with a TTL index (e.g. 24h) instead of SQLite, keeping the stack homogeneous.
- Permission gate: **Manage Messages** required.

---

## 4. Inspect (`$inspect user @user`)

Security-focused deep-dive on a member. Requires **Administrator** permission.

### What it shows
- User tag + ID
- Join date (relative)
- Top role
- **Important permissions** — a curated list: Administrator, ManageGuild, ManageRoles, ManageChannels, ManageWebhooks, BanMembers, KickMembers, ModerateMembers, ManageMessages, MentionEveryone, ManageNicknames, ManageEmojisAndStickers, ManageEvents
- **Other permissions** — all remaining permissions not in the important list
- All roles (up to 20, "and N more" overflow)
- **Whitelisted** — if the user is in the antinuke whitelist, shows which bypass actions they have
- **Extra Owner** — flags if they are an Extra Owner
- **Quarantine** — flags if they are currently quarantined (with reason)

### Implementation notes
- Reads from in-memory `AntiNukeMemory` — the result reflects live runtime state, not just what's in the DB.
- Single CV2 ContainerBuilder, no buttons/tabs needed. Clean and fast.

---

## 5. Hide / Unhide Channels (`$hide`, `$unhide`)

Toggles `ViewChannel: false` / `ViewChannel: true` on the `@everyone` role's permission overwrite for a channel.

### Usage
- `$hide [#channel]` — hides the channel from @everyone. Defaults to current channel if no argument.
- `$unhide [#channel]` — restores ViewChannel for @everyone.

### Permission gate
**Manage Channels** for the invoker. Bot needs **Manage Channels** and must be able to manage the target channel.

### Implementation notes
- Uses `channel.permissionOverwrites.edit(guild.id, { ViewChannel: false }, { reason: ... })`.
- Simple, no DB required.
- Should integrate with modlog (a hide/unhide action is worth logging alongside lock/unlock).

---

## 6. Unban All (`$unbanall`)

Mass-unbans all banned users from the server. Confirmation prompt before execution.

### Flow
1. Fetches all bans. If zero, returns early.
2. Sends a CV2 confirmation panel with total count + Yes/Danger / No/Secondary buttons (60s timeout).
3. On Yes: deletes the confirm panel, sends a loading message, iterates all bans calling `guild.members.unban()`.
4. Reports `N unbanned out of M total`.

### Permission gate
**Ban Members** for invoker + bot. Invoker must be server owner or have a higher role than the bot.

### Implementation notes
- No rate-limit protection in the reference implementation — on large ban lists this can 429. For Cassie, add `await sleep(500)` between each unban.
- Reason string includes invoker tag + ID for audit log.

---

## 7. Unmute All / Untimeout All (`$unmuteall`)

Removes all active timeouts from every timed-out member. Confirmation required. Rate-limit safe (1 second between each removal).

### Flow
1. Fetches all members, filters to `isCommunicationDisabled()`.
2. Shows count + Yes/No confirm (30s timeout).
3. On Yes: sets a per-guild `unmuteallRunning` guard flag to block double-runs.
4. Iterates with 1s sleep between members. 3s extra sleep on 429.
5. Reports result. Clears guard flag.

### Permission gate
**Moderate Members** for both invoker and bot. Invoker's highest role must be above bot's highest role.

### Implementation notes
- Cassie already has `$untimeout` (remove one, or multi-select panel). This is the mass version.
- The guard flag (`message.guild.unmuteallRunning`) is in-memory only — resets on restart. Acceptable.

---

## 8. Purge Bot Messages (`$purgebot`)

Scans the last N messages in a channel (default 100, max 1000) and bulk-deletes only messages sent by bots.

### Usage
`$purgebot [amount]`

### Implementation notes
- Cassie already has `$purge bot` which does the same thing. This is **redundant** — skip unless you want the standalone alias `$purgebot` / `$pb` / `$clearbots`.

---

## 9. Extended `$list` Subcommands

Reference1's `$list` supports many more subcommands than Cassie's current implementation (roles, members, emojis, stickers, channels, bans). These can be added as new list types to Cassie's existing paginated system.

| Subcommand | What it lists | Notes |
|---|---|---|
| `admins` | All members who have the **Administrator** permission | Force-fetches all members |
| `adminrole` | All roles that have the **Administrator** permission | Cache-only |
| `mod` | Members who have Kick + ManageMessages + ManageRoles + ModerateMembers | Force-fetches |
| `bot` | All bot accounts in the server | Force-fetches |
| `inrole @role` | All members who have a specific role | Force-fetches |
| `booster` | Members who are currently boosting the server | Force-fetches |
| `noroles` | Members with zero roles (only @everyone) | Force-fetches |
| `muted` | Members currently under a timeout | Force-fetches |
| `joinpos` | All members sorted by join date (oldest first) | Force-fetches; slow on large servers |

### Implementation notes
- All the above subcommands force-fetch all members (`guild.members.fetch()`). On large servers this is heavy — consider gating behind a warning for servers with 1000+ members.
- These slot naturally into the existing `fetchListItems` + `formatListLine` + `buildDetailPayload` pattern in `xoxo/components/utility/list.ts`. Just add new `ListType` values.
- `inrole` needs a role argument — the list command's current usage string would need updating.

---

## 10. Role Protect (`$roleprotect`)

Marks specific roles as "protected." If a protected role is deleted or its permissions are modified, the antinuke system restores it automatically.

### Subcommands
| Subcommand | What it does |
|---|---|
| `add @role` | Adds a role to the protected list |
| `remove @role` | Removes a role from the protected list |
| *(no subcommand)* | Lists all currently protected roles (with mention + ID; shows "Missing" if role was deleted) |

### Permission gate
Server owner or Extra Owner only.

### Events that trigger restoration
- `roleDelete` — re-creates the role with original name + permissions + color + position
- `roleUpdate` — if a protected role's permissions are changed, reverts them

### DB/Memory
Stored in the `antinuke` MongoDB document under `protectedRoles: String[]`. Also mirrored in `AntiNukeMemory` for fast lookup.

### Implementation notes
- Requires antinuke to be enabled.
- Role recreation after deletion requires storing enough data to recreate it (name, permissions, color, hoist, mentionable, position). The reference implementation stores just the ID and relies on the `roleDelete` audit log for the original data.
- In Cassie this integrates cleanly into the existing antinuke system — add `protectedRoles` field to the antinuke DB doc, add the restore logic to the `roleDelete` and `roleUpdate` events.

---

## 11. Security Scan (`$security scan`)

A quick server security audit. No subcommands other than `scan`. No DB required.

### What it reports
- Bot's highest role (the baseline for the position check)
- **Administrator Roles** — all roles with Administrator permission (up to 15)
- **Manage Roles roles** — all roles with ManageRoles permission (up to 15)
- **Roles at or above the bot** — all roles positioned at or above the bot's highest role (risk: can edit bot's roles)
- **Mentionable Administrator Roles** — admin roles that can be freely pinged (risk: mass-mention abuse)
- **Missing Bot Permissions** — Administrator, ManageRoles, ManageChannels, BanMembers, KickMembers, ViewAuditLog, ManageWebhooks

### Implementation notes
- All data comes from `guild.roles.cache` — no API calls needed after startup.
- Single CV2 container, plain text. No buttons/sessions required.
- Permission gate: **Administrator** for invoker (since it exposes sensitive role structure).
- Pair this with `$serverinfo Security` tab for a great moderation toolkit.

---

## 12. Extra Owner System

A secondary owner tier that sits between "server owner" and "whitelisted users" in the antinuke trust hierarchy. Extra Owners bypass all antinuke checks identically to the real owner and can run owner-only antinuke commands (like `$antinuke enable/disable`, `$roleprotect`, `$autorole`).

### Commands (subcommands of `$extraowner`)
| Subcommand | What it does |
|---|---|
| `add @user` | Grants Extra Owner status |
| `remove @user` | Revokes it |
| `list` | Shows all current Extra Owners |
| `reset` | Removes all Extra Owners |

### Distinction from Cassie's whitelist
Cassie already has a **whitelist** on the antinuke (per-action bypass for trusted admins). Extra Owner is a *higher* tier — not just "bypass antinuke actions" but "can configure antinuke itself." In reference1:
- Whitelist = bypass specific punishment modules (e.g. "this user can delete channels without being punished")
- Extra Owner = full owner-equivalent trust, can run `$antinuke`, `$roleprotect`, `$autorole`, etc.

### DB/Memory
Stored in `antinuke.extraOwners: String[]` and mirrored in `AntiNukeMemory.extraOwners: Set<string>`.

---

## 13. Antinuke Panic Mode (`$antinuke panic`)

Manual emergency lockdown that strips dangerous permissions from all non-whitelisted, non-owner roles.

### Subcommands
| Subcommand | What it does |
|---|---|
| `panic enable` | Saves a full permissions backup of all roles to DB (`panicBackup`), then strips dangerous perms from every non-whitelisted role. Owner-only. |
| `panic disable` | Reverts to backed-up permissions snapshot (restores all roles via `restorePanicMode`). |
| `panic restore` | Same as disable — forces a restore even if `panic` flag is not set. Owner-only. |
| `panic whitelist <roleId>` | **Adds** a role to the panic whitelist — roles on this list are not stripped during panic mode. Stored in `panicWhitelistRoles[]` on the antinuke document. |
| `panic unwhitelist <roleId>` | Removes a role from the panic whitelist. |
| `panic whitelisted` | **Lists** all currently whitelisted roles (those that are excluded from the panic strip). |

### What is stripped
The same "dangerous permissions" set that antinuke normally watches: Administrator, ManageRoles, ManageChannels, ManageWebhooks, BanMembers, KickMembers, ManageMessages, ManageNicknames, ManageGuild, ManageEmojisAndStickers, ManageEvents.

### DB
`panicBackup` field on the antinuke document: stores role permission bitfields for quick per-role restoration via `restorePanicMode` in the sentinel.

### Auto-trigger
Panic mode also activates automatically when sentinel detects a threshold breach (too many violations in the 10-second window).

### Implementation notes
- Cassie already has antinuke punishments (ban/kick/quarantine per violator). Panic mode is different — it's a **server-wide hardening** action, not a per-user punishment.
- The backup/restore cycle is the critical part. Permissions are stored as permission bitfield strings to survive restarts.

---

## 14. Antinuke Backup / Restore (`$antinuke backup` / `$antinuke restore`)

Manually save and reload a full snapshot of every role's permissions, independently of Panic Mode.

- **`$antinuke backup`** — takes a snapshot of all role permissions right now and saves to DB.
- **`$antinuke restore`** — reverts all role permissions to the most recent snapshot.

### Use case
Before making large permission changes (restructuring roles), take a backup. If something goes wrong, restore in one command.

### What is backed up
Both **roles** (name, permissions bitfield, color, hoist, mentionable, position) and **channel permission overwrites** (allow/deny bitfields per overwrite target). Restore re-applies role permissions and re-sets channel overwrites, skipping any role above the bot's highest position.

### DB
Stored in the antinuke document as `securityBackup: { createdAt, createdBy, roles[], channels[] }`. `roles[]` entries include `{ id, name, permissions, color, hoist, mentionable, position }`. `channels[]` entries include `{ id, name, type, parentId, permissionOverwrites[] }`.

---

## 15. Antinuke Extra Modules (reference1 has, Cassie may be missing)

Reference1's antinuke has 14 explicitly defined modules. Compare against whatever Cassie's current module list is and add any that are missing:

| Module key | Label | Trigger |
|---|---|---|
| `antiban` | Ban Protection | `guildBanAdd` |
| `antiunban` | Unban Protection | `guildBanRemove` |
| `antikick` | Kick Protection | `guildMemberRemove` (via audit log) |
| `antibotadd` | Bot Add Protection | `guildMemberAdd` where member is a bot |
| `antichannel` | Channel Protection | `channelCreate`, `channelDelete`, `channelUpdate` |
| `antirole` | Role Protection | `roleCreate`, `roleDelete`, `roleUpdate`, `guildMemberRoleAdd`, `guildMemberRoleRemove` |
| `antiwebhook` | Webhook Protection | `webhookCreate`, `webhookUpdate` |
| `antiserver` | Server Update Protection | `guildUpdate` |
| `antiemoji` | Emoji Protection | `emojiCreate`, `emojiDelete` |
| `antisticker` | Sticker Protection | `stickerCreate`, `stickerDelete` |
| `antiintegration` | Integration Protection | `integrationCreate`, `integrationDelete` |
| `antithread` | Thread Protection | `threadDelete` |
| `antimention` | Mention Protection | `messageCreate` (mass @everyone / large role pings) |
| `antilink` | Linked Role Protection | `roleUpdate` — strips dangerous perms from linked roles automatically |

---

## 16. Noprefix Expiry Service

Time-limited noprefix grants that expire automatically. Instead of a static list of permanent noprefix users, each entry can have an optional `expiresAt` Unix timestamp. A background interval (every 60s) checks all entries and removes expired ones.

### Schema change to existing noprefix storage
```
noprefix_users: {
  [userId]: {
    granted: true,
    expiresAt?: number   // Unix seconds; absent = permanent
  }
}
```

### Usage extension (developer only)
`$noprefix add @user 7d` — grants for 7 days, then auto-revokes.

### Implementation notes
- The service is a class (`NoPrefixExpiryService`) started at boot alongside other loaders.
- If `expiresAt` is absent, the entry is treated as permanent (existing behaviour unchanged).
- Cassie already has in-memory noprefix caching — the expiry check just needs to also clear the in-memory set when it removes an entry.

---

## 17. Rate-Limit Auto-Blacklist

Users who spam commands (5+ commands within the cooldown window) are automatically blacklisted for 24 hours with reason `"Spamming"`. This is enforced in the command execution handler, not in individual commands.

### Logic
- Per-user command count tracked in-memory with a rolling window.
- On threshold breach: `db.addUserToBlacklist(userId)` + set an expiry timestamp → after 24h the entry is removed (requires a similar expiry service to the noprefix one, or a TTL check on each blacklist lookup).

### Implementation notes
- Cassie's `messageCreate` already has a blacklist check at the top. The auto-blacklist just needs to write to the same collection.
- The 24-hour auto-expiry can use the same expiry pattern as noprefix (a periodic cleanup job, or a `expiresAt` field checked on each blacklist lookup).

---

## 18. Quarantine Manual Management (`$quarantine`, `$quarantineadd`)

Manual tools to put members into or release them from quarantine without waiting for an antinuke trigger. Separate from the antinuke module that auto-quarantines violators.

### Commands
| Command | What it does |
|---|---|
| `$quarantine @user [reason]` | Shows the quarantine panel for a user (current status, roles stored, reason) |
| `$quarantineadd @user [reason]` | Manually quarantines a member (strips roles, applies quarantine role, stores original roles) |
| `$quarantine release @user` | Restores the member's original roles and removes the quarantine role |

### DB
Original roles stored per-user in the antinuke document: `quarantine: { [userId]: { roles: String[], reason: String, at: Date } }`.

### Implementation notes
- Cassie already has quarantine as part of antinuke punishment — this just exposes it as manual commands for moderators.
- Release logic: read stored roles, re-add them (skip if role deleted or above bot), remove quarantine role.

---

## 19. Check Antinuke (`$checkantinuke`)

Quick read-only status dump of the current guild's antinuke configuration. No interactive panel, no edits. Useful for glancing at the config without navigating the full `$antinuke status` panel.

### What it shows
- Enabled / Disabled
- Punishment type
- Log channel
- Whitelist count
- Extra Owner count
- Which modules are on/off
- Quarantine role

### Implementation notes
- Trivially implemented as a simpler alias for `$antinuke status` in Cassie. Low priority unless you want the faster read path.

---

## 20. Additional Antinuke Subcommands

Three subcommands in reference1's `$antinuke` that are not in the panic/backup sections above and may be worth adding to Cassie's own `$antinuke`.

### `$antinuke audit @user`
Shows a per-user security audit from the antinuke's perspective:
- Whether they are the server owner / extra owner / whitelisted
- Whether they hold a panic-whitelist role
- Whether they have Administrator permission
- Which administrator roles they have (by mention + ID)

Reads entirely from `AntiNukeMemory` — zero DB calls. Requires server owner or extra owner.

### `$antinuke logs #channel`
Quick shorthand to set (or update) the antinuke log channel, equivalent to going through `$antinuke config`. Writes `logChannel` to the antinuke document and reloads cache. Saves a full config-panel interaction when the admin only wants to change the log destination.

### `$antinuke repair`
Rebuilds the guild's antinuke runtime state:
1. Checks if the **unbypass role** still exists; recreates it if missing and reattaches it to the bot.
2. Checks if the **quarantine role** exists and its permission overwrites are correct; repairs if not.
3. Reloads the full guild antinuke cache from MongoDB.

Useful after a server restructure that may have deleted managed roles created by antinuke.

---

## 21. Role Info (`$roleinfo`)

A standalone role information command. Cassie shows role details inside the `$list` detail panel, but there is no dedicated `$roleinfo @role` shortcut.

### What it shows
- Role name, ID, hex color, raw position
- Created timestamp (relative)
- Mentionable, managed (bot/integration), hoisted flags
- Permissions — if Administrator: `Administrator (All Permissions)`; otherwise, a sorted, backtick-formatted list of every permission the role has
- Number of members who currently hold the role (force-fetches all members)

### Aliases
`$ri`

### Implementation notes
- Requires **no special permissions** (Cassie's existing pattern: anyone can use info commands).
- The data is a subset of what `$list roles` detail panel already shows. This is purely a convenience command to look up a single role directly.

---

## Skipped — Already in Cassie or Irrelevant

The following reference1 commands and systems are **not** worth copying because Cassie already covers them or they are tightly coupled to reference1's specific infrastructure:

| File | Reason |
|---|---|
| `commands/utility/ping.js` | Cassie has `$ping` |
| `commands/utility/uptime.js` | Cassie has `$uptime` |
| `commands/moderation/ban.js` | Cassie has `$ban` |
| `commands/moderation/kick.js` | Cassie has `$kick` |
| `commands/moderation/mute.js` | Cassie has `$timeout` |
| `commands/moderation/unmute.js` | Cassie has `$untimeout` |
| `commands/moderation/unban.js` | Cassie has `$unban` |
| `commands/moderation/nick.js` | Cassie has `$nick` |
| `commands/moderation/purge.js` | Cassie has `$purge` |
| `commands/moderation/role.js` | Cassie has `$roleadd` / `$roleremove` |
| `commands/moderation/lock.js` | Cassie has `$lock` |
| `commands/moderation/unlock.js` | Cassie has `$unlock` |
| `commands/moderation/prefix.js` | Cassie has `$setprefix` |
| `commands/moderation/pb.js` (purgebot) | Cassie has `$purge bot` |
| `commands/security/antinuke.js` (core) | Cassie has `$antinuke` — only the *extra subcommands* (audit, logs, repair, panic, backup/restore) are worth adding |
| `commands/security/checkantinuke.js` | Duplicate of `$antinuke status` |
| `commands/security/whitelist.js` | Cassie has `$whitelist` |
| `commands/security/quarantine.js` + `quarantineadd.js` | Cassie has quarantine inside antinuke — manual commands (section 18 above) are the *extension* |
| `commands/security/extraowner.js` | Covered in section 12 above |
| `commands/system/blacklist.js` | Cassie has `$blacklist` |
| `commands/system/blacklistserver.js` | Cassie has `$blacklistserver` |
| `commands/system/eval.js` | Cassie has `$eval` |
| `commands/system/noprefix.js` | Cassie has `$noprefix` (expiry extension is section 16) |
| `commands/system/serverlist.js` | Cassie has `$serverlist` |
| `commands/system/maintancemode.js` | Cassie has `$maintenance` |
| `commands/system/reloadcache.js` | Cassie has equivalent cache reload logic |
| `commands/system/leaveserver.js` | Cassie has `$leaveserver` |
| `commands/system/globalban.js` | Uses `client.cluster.broadcastEval` — reference1 runs a shard cluster manager that Cassie does not. Not directly portable. |
| `core/sentinel.js` | The security enforcement engine — Cassie has its own equivalent in `xoxo/core/antinuke/sentinel.ts`. Relevant logic is captured in the feature descriptions above. |
| `core/antinukeMemory.js` | Cassie has `xoxo/core/antinuke/memory.ts` |
| `core/resolveAuditAdvanced.js` | Cassie has audit log resolution in the antinuke event handlers |
| `core/buildGuildCache.js` | Cassie has equivalent startup cache hydration |
| `events/clientReady.js` | Cassie has `ready.ts` |
| `events/botadd.js` / `botleave.js` | Cassie has `guildCreate.ts` / `guildDelete.ts` |
| `events/antinukeCleanup.js` | Cassie cleans up stale antinuke references inside its own event handlers |
| `events/memberadd.js` | Cassie has `guildMemberAdd.ts` (autorole from section 2 hooks here) |
| `events/snipeHandler.js` | Internal to the snipe feature — covered in section 3 |
| `events/autorole.js` | Internal to the autorole feature — covered in section 2 |
| All remaining events (antiban, antibotadd, antikick, etc.) | These are antinuke module event handlers — covered by the module list in section 15 |
| `handlers/commandExecution.js` | Rate-limit auto-blacklist covered in section 17; rest is infrastructure |
| `handlers/cooldownManager.js` | Cassie has its own cooldown system |
| `handlers/noprefixExpiry.js` | Covered in section 16 |
| `models/antinuke.js`, `automod.js`, `autorole.js`, `Premium.js` | DB schemas — covered inside the relevant feature sections above |

---

## Priority Ranking

| Priority | Feature | Effort |
|---|---|---|
| ⭐⭐⭐ High | **Automod** — huge utility, fully CV2-native in reference1 | Medium–High |
| ⭐⭐⭐ High | **Snipe** — commonly requested, CV2 panel already written | Low–Medium |
| ⭐⭐⭐ High | **Extended `$list` subcommands** — slots into existing system | Low |
| ⭐⭐ Medium | **Autorole** — clean CV2 implementation ready | Low–Medium |
| ⭐⭐ Medium | **Hide / Unhide** — two tiny commands, no DB | Very Low |
| ⭐⭐ Medium | **Unban All** — confirmation pattern same as existing commands | Low |
| ⭐⭐ Medium | **Unmute All** — same pattern, rate-limit-safe version needed | Low |
| ⭐⭐ Medium | **Security Scan** — read-only, no DB, great pair with `$serverinfo` | Very Low |
| ⭐⭐ Medium | **Inspect** — read-only, useful for mods | Low |
| ⭐⭐ Medium | **Extra antinuke modules** (emoji, sticker, integration, thread) | Low (events already exist or easy to add) |
| ⭐ Low | **Role Protect** — requires event hooks + role restoration logic | Medium |
| ⭐ Low | **Extra Owner tier** — antinuke architecture change | Medium |
| ⭐ Low | **Antinuke Panic Mode** — powerful but niche | Medium |
| ⭐ Low | **Antinuke Backup / Restore** — useful safety net | Low |
| ⭐ Low | **Noprefix Expiry** — QoL for developer use | Low |
| ⭐ Low | **Rate-limit Auto-Blacklist** | Low |
| ⭐ Low | **Quarantine Manual Commands** | Low |
| — Skip | **Purge Bot Messages** — already covered by `$purge bot` | — |
| — Skip | **Check Antinuke** — already covered by `$antinuke status` | — |
