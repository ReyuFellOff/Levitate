# Moderation Command Ideas for Levitate

> Commands to add to the moderation suite. Sorted by priority tier.
> Each entry includes usage syntax, what permissions are required, key implementation notes,
> and whether a confirmation dialog is needed.

---

## Tier 4 — Member Management

### `mute` / `unmute` (text mute via role)
**Gap this fills:** `timeout` is a Discord-native timeout. Some servers prefer a Muted role that can be customised (e.g. can still read but not write, or can write in a designated channel).

```
$mute <@user|ID|name> [duration] [reason]
$unmute <@user|ID|name> [reason]
/mute user:[user] duration:[text] reason:[text]
/unmute user:[user] reason:[text]
```

- Assigns/removes a role named `Muted` (case-insensitive search, falls back to ID stored in guild settings)
- Optionally stores duration in DB and auto-unmutes after expiry (requires a background job or cron)
- **Permissions:** `ManageRoles`

---

### `softban`
**Gap this fills:** Temporary ban to clear messages without permanently removing the user.

```
$softban <@user|ID|name> [days:1-7] [reason]
/softban user:[user] days:[number] reason:[text]
```

- Bans → immediately unbans → net effect: messages are purged, user is not permanently banned
- `days` controls message delete window (same as `$ban`)
- DMs user before the ban
- **Confirmation required** for slash

---

### `massban`
**Gap this fills:** Banning multiple raiders quickly. Companion to `masskick`.

```
$massban <@user1> <@user2> ... [reason]   — space-separated, up to 20 users
/massban users:[string] reason:[text]     — newline or space-separated IDs
```

- Parses multiple IDs/mentions from the input
- Shows a list of targets + Confirm/Cancel dialog before executing
- Reports success/failure count on completion
- **Confirmation required**
- **Permissions:** `BanMembers`

---

## Tier 5 — Server Protection / Anti-Abuse

### `nuke`
**Gap this fills:** Recreating a channel to wipe its entire history (faster than purge for very active channels).

```
$nuke [#channel]
/nuke channel:[channel]
```

- Clones the channel (copies all settings, permissions, topic, slowmode, position)
- Deletes the original
- Sends a confirmation message in the new channel
- **Confirmation required** (destructive and irreversible)
- **Permissions:** `ManageChannels`

---

### `antispam` (settings)
```
$antispam enable/disable
$antispam threshold <number>    — messages per window before action
$antispam window <seconds>      — time window
$antispam action warn|mute|kick|ban
/antispam ...
```

- Stores settings per guild in MongoDB
- Runtime filter runs in `messageCreate.ts` alongside the sticky and prefix logic
- Tracks `Map<userId, { count, firstMessageAt }>` in memory per cluster
- Clears on reset or after `window` seconds
- **Permissions:** `ManageGuild` to configure

---

### `antiraid` (settings)
```
$antiraid enable/disable
$antiraid threshold <number>   — joins per window before triggering
$antiraid window <seconds>
$antiraid action lock|kick|ban
/antiraid ...
```

- Tracks join rate in `guildMemberAdd.ts`
- On threshold exceeded: executes action, notifies mod log channel, DMs server owner
- **Permissions:** `ManageGuild` to configure

---

## Tier 6 — Utility Moderation

### `reason`
**Gap this fills:** Updating the reason on a moderation action after the fact (matches how Dyno/Carl-bot work).

```
$reason <case-id> <new reason>
/reason case_id:[number] reason:[text]
```

- Requires a warning/modlog system to be implemented first (case IDs come from that)
- Updates the reason field in the DB and edits the modlog embed if the channel is still accessible
- **Permissions:** `ModerateMembers`

---

### `duration` (extend or shorten a timeout)
```
$duration <@user|ID|name> <new-duration>
/duration user:[user] duration:[text]
```

- Reads the current timeout expiry and either extends or shortens it
- Internally calls `guild.members.fetch(id)` → `member.timeout(newDurationMs)`
- `parseDuration` from `xoxo/helpers/parseDuration.ts` already handles this

---

### `tempban`
```
$tempban <@user|ID|name> <duration> [reason]
/tempban user:[user] duration:[text] reason:[text]
```

- Bans the user, stores `{ userId, guildId, unbanAt }` in MongoDB
- A scheduled job (or a boot-time check) scans for expired tempbans and calls `guild.bans.remove`
- Shows remaining time in `$modlogs` output

---

### `note`
**Gap this fills:** Mod team internal notes about a member that don't count as formal warnings.

```
$note add <@user|ID|name> <text>
$note list <@user|ID|name>
$note delete <@user|ID|name> <note-id>
/note subcommand:[add|list|delete] ...
```

- Separate `notes` collection from `warnings` — notes are staff-only annotations
- Only visible to users with `ModerateMembers` permission
- Not DM'd to the target user

---

### `history` (full member moderation history)
```
$history <@user|ID|name>
/history user:[user]
```

- Shows all mod actions for a user across all time: warns, kicks, bans, timeouts, notes
- Each entry shows: type, reason, moderator, timestamp
- Paginated CV2 panel

---

## Implementation Notes for All Commands

### Permissions pattern
Every moderation command checks two things before executing:
```ts
// 1. Invoker permission
const invokerPerms = message.channel.permissionsFor?.(message.member);
if (!invokerPerms?.has?.(PermissionFlagsBits.BanMembers)) {
  return sendError(ctx, 'You need the **Ban Members** permission to use this command.');
}
// 2. Bot permission
const botMember = message.guild.members.me;
if (!botMember?.permissions.has(PermissionFlagsBits.BanMembers)) {
  return sendError(ctx, 'I need the **Ban Members** permission to do this.');
}
// 3. Role hierarchy (for member-targeting commands)
if (target.roles.highest.position >= botMember.roles.highest.position) {
  return sendError(ctx, 'My role is not high enough to moderate this member.');
}
```

### DM pattern (from ban.ts / kick.ts)
```ts
const dmPayload = buildBanDMPayload(guild.name, reason); // CV2 container
await target.send(dmPayload).catch((): null => null); // non-fatal
```
Always DM before the action, not after (the action may prevent future DMs if the bot leaves shared servers).

### Confirmation button IDs
Pattern: `<cmd>:<action>:<interaction-or-message-id>`
Examples:
```
warn:confirm:1234567890
massban:confirm:1234567890
massban:cancel:1234567890
```
The ID suffix scopes the collector to that specific message so there's no need for central routing in `interactionCreate.ts`.

### Slash confirmation flow (copy from masskick/massnick/role)
```ts
await interaction.deferReply();
// ... build target list ...
await interaction.editReply(buildActionConfirmPayload(confirmId, cancelId, title, description));
const confirmMsg = await interaction.fetchReply().catch((): null => null);
const channelCtx = { channel: interaction.channel };

const collector = confirmMsg.createMessageComponentCollector({
  filter: (i: any) => (i.customId === confirmId || i.customId === cancelId) && i.user.id === interaction.user.id,
  max: 1, time: 30_000,
});
collector.on('collect', async (i: any) => {
  await i.deferUpdate().catch((): null => null);
  if (i.customId === confirmId) {
    await interaction.deleteReply().catch((): null => null);
    await runAction(channelCtx, ...);
  } else {
    await i.editReply(buildActionCancelledPayload(...)).catch((): null => null);
    setTimeout(() => interaction.deleteReply().catch((): null => null), 3_000);
  }
});
collector.on('end', (_: any, reason: string) => {
  if (reason !== 'time') return;
  confirmMsg.edit(buildActionTimedOutPayload(...)).catch((): null => null);
});
```

### New MongoDB collections needed
| Collection | For |
|---|---|
| `mod_settings` | `$modlog setmodlog`, `$antispam`, `$antiraid` settings per guild |
| `tempbans` | `$tempban` — tracks ban expiry |
| `mod_notes` | `$note` — staff-only member notes |

All collections follow the existing prefix pattern: `${BOT_IDENTIFIER}_${collection}`.
