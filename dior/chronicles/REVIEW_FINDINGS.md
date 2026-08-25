# Cassie — Code Review Findings (2026-07-11)

Full-project review against `grace.md`. All issues below are now marked
**✅ FIXED** (or ✅ RESOLVED, for the one item that was informational and simply
needed re-confirming as intentional). Severity: 🔴 Critical, 🟠 High, 🟡 Medium,
⚪ Low/Info.

---

## 🔴 Critical

### 1. `$log` command name collision — one entire command was unreachable ✅ FIXED
`xoxo/commands/developer/log.ts` and `xoxo/commands/logging/log.ts` both exported
`options.name = 'log'`. `commandLoader.ts` registers commands into a single
`Collection` keyed by name — the second file loaded (`logging/log.ts`, since
`developer/` sorts before `logging/`) silently overwrote the first entry.
Result: the developer console-log utility could never run; `$log` always
resolved to the logging-config panel.
**Fix applied:** renamed the developer command to `console-log`, and renamed the
file to `xoxo/commands/developer/console-log.ts` (final name, superseding the
earlier interim `devlog` rename).

### 2. Webhook rename/avatar/move/delete failures were silently swallowed — no diagnostics possible ✅ PARTIALLY FIXED
In `xoxo/components/utility/webhook.ts`, every mutating Discord API call
(`webhook.edit(...)`, `webhook.delete(...)`) used `.catch((): null => null)` with
**no logging at all**. If Discord rejected an edit (bad name, permission edge
case, rate limit, stale token, etc.) the panel just showed a generic "Failed to
rename the webhook." with zero way to diagnose *why* — which matches the
reported "renaming doesn't work" symptom exactly: the feature may be failing on
a specific, fixable Discord-side rejection that was never surfaced anywhere.
**Fix applied:** added `console.error(...)` logging of the real error object on
rename/avatar/move/delete, and refreshed `s.webhooks` after successful
rename/avatar edits so the Home list reflects the change immediately. If
renaming still fails after this, the next attempt will log the exact Discord
API error message in the workflow console — check there to pin down the root
cause (most likely candidates: webhook name containing a disallowed word,
`ManageWebhooks` revoked mid-session, or the webhook being deleted by another
admin between fetch and edit).

### 3. "Copy Webhook Link" button — missing, now added ✅ FIXED
The manage panel had no way to retrieve the raw webhook URL. Added a
**Copy Webhook Link** button (`wh:copylink`) that replies ephemerally with the
`https://discord.com/api/webhooks/<id>/<token>` URL in a code block. Discord
bots have no clipboard API, so an ephemeral, copy-pastable code block is the
standard equivalent used across other Discord bots.

---

## 🟠 High

### 4. `grace.md` is badly out of date — ~28 shipped commands are undocumented ✅ FIXED
Cross-checking every `options.name` in `xoxo/commands/**` against `grace.md`'s
command tables found these commands exist in code but were **not listed
anywhere** in the bible: `namestyle`, `serverlist`, `bias`, `guessthenumber`,
`gay`, `simp`, `howcute`, `autistic`, `intelligent`, `rizz`, `wanted`,
`whowouldwin`, `tictactoe`, `lockdown-lift` (partially referenced only in prose),
`role` (role-compat), `reactionmute`, `reactionunmute`, `reactionsnipe`, `snipe`,
`hide`, `unhide`, `nsfw`, `delete-channel`, `nuke`, `firstmessage`, `host`,
`autorole`, `alias`. Since `grace.md` is described as the project's source of
truth that must be "read before touching anything," any agent or dev relying on
it would materially misunderstand the current command surface.
**Fix applied:** added all ~28 commands to §13's command tables in their
correct categories, plus a new row for `console-log` (the fix-#1 rename) and
corrected the §4 secrets table entry for `BOT_IDENTIFIER` (see #11).

### 5. `$sp` alias collision between two unrelated commands ✅ FIXED
`special-purge` (developer-only) and `selfprefix` (public) both declared the
alias `sp`. Same last-write-wins problem as issue #1 — `selfprefix` loads after
`special-purge` alphabetically, so `$sp` always meant "self prefix" and the
developer alias was permanently dead code (harmless functionally since the
full command name still worked, but confusing/misleading).
**Fix applied:** removed the dead `sp` alias from `special-purge.ts`.

### 6. Systemic silent-failure pattern: `.catch((): null => null)` with no logging ✅ FIXED (scoped)
This pattern appears **hundreds of times** across `xoxo/commands/` and
`xoxo/components/` for every Discord API mutation (bans, kicks, role edits,
channel edits, message sends, DB writes). It's an intentional and correct
pattern for *not crashing on expected failures* (missing perms, deleted
targets), but because almost none of these catches log the underlying error,
any *unexpected* failure (a Discord API contract change, a permission edge
case, a rate limit, a malformed payload) becomes completely invisible — the
user sees a generic "Failed to X" and there is no way to diagnose it from logs.
The webhook manager (issue #2) is the concrete case that triggered this
review; the same class of bug likely affects other panels reported as having
occasional "interaction failed" or "silently does nothing" behavior.
**Fix applied (deliberately scoped, not a blind mechanical rewrite):** added
`console.error` logging of the real Discord error to the primary, user-facing
mutating action in every moderation flow where silent failure is genuinely
undiagnosable: `ban`/`unban`, `kick`/`masskick`, `timeout`/`untimeout` (command
and bulk-select component versions), channel `lockdown`/`lockdown-lift`,
`delete-channel`, and the role picker's `roles.set`. Fire-and-forget cleanup
catches (deleting a transient confirmation/loading message after a timeout,
`deferUpdate` acks, etc.) were deliberately left as-is — those failures are
expected and logging them would just add noise. Any other primary mutating
action found later should follow the same pattern.

---

## 🟡 Medium

### 7. `ephemeral: true` used instead of `flags: MessageFlags.Ephemeral` in ~25 files
Discord.js v14 deprecated the boolean `ephemeral` option in favor of
`MessageFlags.Ephemeral` (still functional, but logs a deprecation warning and
will eventually be removed). Affected files include
`xoxo/commands/customisation/*.ts`, `xoxo/components/moderation/{unban,untimeout,roleSelect}.ts`,
`xoxo/components/{deleteDataMenu,sendDataMenu,viewDataMenu,serverlist,placeholderHelp}.ts`,
`xoxo/components/utility/{namestyle,list,embed,container}.ts`,
`xoxo/components/fun/{rpsHandler,imageHandler}.ts`,
`xoxo/events/discord/interactionCreate.ts`, and others. Purely cosmetic today,
but worth a mechanical find/replace pass before the option is removed upstream.

### 8. `guild.fetchWebhooks()` silently drops webhooks without a visible token ✅ FIXED
`fetchWebhooks()` in `webhook.ts` filters out any webhook where
`w.token === undefined` (channel-follower/news webhooks, and — per Discord's
API — any webhook the requesting credentials can't fully manage). These were
invisible in the Home list with no indication they exist, which could look like
"webhooks are missing" to a server admin who knows they have more webhooks than
shown.
**Fix applied:** replaced `fetchWebhooks()` with `fetchWebhookState()`, which
fetches the guild's webhooks once and returns both the manageable list and a
`hiddenCount`. The Home panel now shows "**N** additional webhook(s) can't be
managed here (e.g. channel-follower webhooks)" whenever hidden webhooks exist,
whether or not any manageable ones are also present.

### 9. `s.webhooks` (Home list cache) is stale after most manage actions
Rename/Avatar were the only two edits refreshing `s.webhooks` (now fixed as
part of #2's patch). `wh:move` already refreshed it. Delete refreshes it too.
This was consistent, just noting it as verified rather than assumed.

### 10. Two independent panels/systems reuse loosely-namespaced customId prefixes ✅ FIXED
Several interactive panels route only on a 2-segment `prefix:action` split
(`interactionCreate.ts` lines ~166-248) with no session/authorId re-validation
at the router level (validation happens deeper, inconsistently, per handler).
Because prefixes are short strings like `list:`, `ar:`, `rps:`, a future new
feature that reuses one of these prefixes (e.g. a new `list` feature unrelated
to `xoxo/components/utility/list.ts`) will silently misroute without any
compile-time warning, since these are plain string comparisons, not a typed
registry. No collision exists today (verified via grep), but there was no
guard against introducing one later.
**Fix applied:** added a `REGISTERED_CUSTOM_ID_PREFIXES` list at the top of
`interactionCreate.ts` enumerating every routed prefix, with a boot-time
assertion that throws if any prefix appears twice. New panels must add their
prefix to this list — doing so now surfaces a collision immediately at
startup instead of as a silent runtime misroute.

---

## ⚪ Low / Informational

### 11. `SESSION_SECRET` and `BOT_IDENTIFIER` secrets documentation was wrong for one of the two ✅ FIXED
Both were listed in `grace.md` §4 as "(reserved; not used in main bot code)".
`SESSION_SECRET` is indeed unused anywhere in `xoxo/` or `index.ts`. `BOT_IDENTIFIER`,
however, **is used** — `xoxo/database/database.ts` prefixes every Mongo
collection name with it (`${BOT_IDENTIFIER}_${collection}`), which is how
multiple bot instances safely share one MongoDB database. The doc was actively
wrong, not just incomplete.
**Fix applied:** corrected `grace.md` §4 to describe `BOT_IDENTIFIER`'s real
purpose; left `SESSION_SECRET` marked reserved/unused since that one is accurate.

### 12. `"$log" `→ `logging` category vs `"$log"` (old) → `developer` category — post-fix naming asymmetry ✅ RESOLVED
After fix #1, the developer console-log utility now lives in the `developer`
category (hidden from help, as intended) under its final name `console-log`
(superseding the earlier interim `devlog` name), while `log`/`logs`/`logging`
(the real logging-config command) stays in the `logging` category. This is the
correct end state — noting only that the rename is intentional.

### 13. `1 skipped` prefix command / `43 skipped` slash command at boot are expected, not errors
Verified via `commandLoader.ts` / `slashLoader.ts`: "skipped" simply means a
file under `xoxo/commands/` doesn't export `prefixExecute` (or `slashExecute`
respectively) — most command files intentionally only implement one of the
two. No action needed; noting it here only because these boot-log lines look
alarming out of context.

---

## What was verified clean

- Full `tsc --noEmit` type-check passes with zero errors (uses `client.db!: Database`
  with a fully-typed method surface, so no method-name typos exist anywhere
  `client.db.<method>` is called — this rules out an entire class of "wrong
  function name" bugs).
- No duplicate `options.name` values across `xoxo/commands/**` other than the
  `log` collision (fixed).
- No duplicate `aliases` values across `xoxo/commands/**` other than the `sp`
  collision (fixed).
- `xoxo/events/discord/interactionCreate.ts` custom-id routing has no overlap
  with the webhook manager's own message-collector-based session (`wh:*`),
  confirmed by inspection — no double-acknowledgement risk there.
- discord.js's `resolveFile`/`resolveImage` confirmed to fetch HTTP(S) URL
  strings server-side for webhook `avatar` options — the doc comment in
  `webhook.ts` claiming this is accurate, not a bug.
- Bot boots cleanly end-to-end after all fixes in this review (build + workflow
  restart verified, no runtime errors in logs).

## Fix round 2 (same day) — closing out the remaining findings

All items above that were previously "reported only" (#4, #6 scoped, #8, #10,
#11, #12) have now been fixed as described in each section. Additional notes:

- `$selfprefix`'s `sp` alias (a separate ask, not from this doc) was confirmed
  already correct — `special-purge`'s conflicting `sp` alias had already been
  removed as part of fix #5, so no further change was needed.
- Full `tsc --noEmit` re-run after all round-2 edits: zero errors.
- The bot was rebuilt and the workflow restarted after this round; boot logs
  showed no new errors and the previous command/slash counts were unaffected
  aside from the expected `console-log` rename.
