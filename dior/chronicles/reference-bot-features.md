# Reference Bot Features — Potential Imports

> Features present in `reference/soul/` that do not currently exist in the main Cassie bot.
> These are documented for future implementation consideration. Nothing here has been built yet.

---

## 1. Last.fm Integration (27 commands)

A complete Last.fm suite built around the `linklastfm` / `unlinklastfm` account-linking system.

### Account Linking
- **`$linklastfm <username>`** — links a Discord user to a Last.fm account; stored in `lastfm_links` collection
- **`$unlinklastfm`** — removes the link
- **`$lastfmwhois <@user>`** — shows what Last.fm account a Discord user has linked

### Playback Info
- **`$fm` / `$nowplaying`** — now-playing card with album art (canvas-generated)
- **`$fmrecent [limit]`** — recent scrobbles list
- **`$fmtrack [track]`** — full track detail: listeners, playcount, tags
- **`$fmalbum [album]`** — album detail with tracklist
- **`$fmartist [artist]`** — artist bio, listeners, similar artists

### Stats & Charts
- **`$fmplay [timeframe]`** — total scrobble count by period
- **`$fmplaytop`** — top track by scrobble count
- **`$fmtoptracks [timeframe]`** — top tracks leaderboard
- **`$fmtopartists [timeframe]`** — top artists leaderboard
- **`$fmtopalbums [timeframe]`** — top albums leaderboard
- **`$fmtoptags`** — user's top genre tags
- **`$fmweekly`** — weekly chart (tracks or artists)
- **`$fmyearly`** — yearly summary
- **`$fmcharts`** — image collage of top albums/artists for the period (canvas-rendered grid)
- **`$fmprofile`** — user's Last.fm profile card (canvas-generated, shows avatar + stats)

### Social / Server Features
- **`$fmwhoknows [artist]`** — shows who in the server has scrobbled an artist the most (leaderboard)
- **`$fmwhoknowsalbum [album]`** — same but for an album
- **`$fmwhoknowstrack [track]`** — same but for a track
- **`$fmleaderboard`** — server-wide total scrobble leaderboard
- **`$fmcrowns`** — shows all "crowns" a user holds (who-knows #1 spots in this server)
- **`$fmcommon <@user>`** — artists you and another user both listen to
- **`$fmtaste <@user>`** — taste comparison between two users (compatible %)
- **`$fmfriends`** — what your linked friends are listening to right now
- **`$fmgeo [country]`** — top tracks/artists in a country right now
- **`$fmloved`** — tracks the user has loved on Last.fm
- **`$fmrecommend`** — personalized track recommendations based on listening history
- **`$fmsimilar <@user>`** — artists similar to a user's most-listened

### Storage Required
- `lastfm_links`: `{ user_id, lastfm_username, linked_at }`
- `user_stats` (for caching): `{ discord_user_id, totalPlays, songs[], artists[], lastUpdated }`
- Last.fm API key (via Replit Secret)

---

## 2. Music Playback System (19 commands)

Full music bot functionality using Lavalink / a voice connection library.

### Core
- **`$play <query|url>`** — play a song or playlist (YouTube, Spotify, SoundCloud, or JioSaavn with `jssearch:<query>`)
- **`$pause`** / **`$resume`** — toggle playback
- **`$stop`** — stop and clear the queue
- **`$skip`** — skip to the next track
- **`$skipto <position>`** — skip to a specific queue position
- **`$nowplaying`** — now-playing card with progress bar
- **`$queue [page]`** — paginated queue viewer
- **`$peek`** — shows the next N tracks without full queue

### Queue Management
- **`$add <query>`** — add a track to the end of the queue
- **`$remove <position>`** — remove a track from the queue
- **`$move <from> <to>`** — reorder a track
- **`$clear`** — clear the full queue
- **`$shuffle`** — randomize queue order
- **`$loop [track|queue|off]`** — toggle loop mode
- **`$seek <time>`** — seek to a timestamp in the current track

### Session Settings
- **`$volume [0-200]`** — set playback volume (in-session)
- **`$servervolume [0-200]`** — persistent per-server default volume stored in DB (`volumes` collection)
- **`$24/7`** — toggle 24/7 mode (bot stays in VC even when empty), stored in `twentyfour_seven` collection
- **`$grab`** — DMs the user info about the current track (title, URL, thumbnail)

### Join/Leave Helpers (used internally)
- **`$join`** — join the user's VC
- **`$leave`** — leave VC and clear queue
- **`$rejoin`** — reconnect to VC if dropped

### Storage Required
- `volumes`: `{ guild_id, volume, updatedAt }`
- `twentyfour_seven`: `{ guild_id, channelId, enabled, updatedAt }`
- Lavalink node connection (external service or self-hosted)

---

## 3. Spotify Integration

- **`$linkspotify`** — OAuth-based Spotify account link (requires app credentials + redirect URI)
- **`$unlinkspotify`** — removes the Spotify link
- **`$playspotify <track|playlist>`** — plays the user's Spotify track/playlist in VC

### Storage Required
- `spotify_links`: `{ user_id, spotify_id, display_name, linked_at }`
- Spotify Client ID + Secret (via Replit Secrets)
- OAuth callback route (Express endpoint in `keepalive.ts` or a new router)

---

## 4. Node / Cluster Developer Tools

Commands not currently in the main bot's developer suite:

- **`$node-status`** — lists all Lavalink nodes, their status, ping, player count
- **`$disconnect-node <id>`** — forcibly disconnect a Lavalink node
- **`$reconnect-node <id>`** — reconnect a specific Lavalink node
- (These are music-infrastructure-specific — only relevant if music is added)

---

## 5. Additional Utility Commands

From `reference/soul/commands/utility/`:

- **`$serverpurge`** — developer-level purge that can target multiple channels at once; different from `$special-purge` in scope
- **`$steal <emoji>`** — adds an emoji from another server to the current server (same concept as `$emoji steal` which already exists in Cassie under the developer category)

---

## Implementation Notes

- All music features require a voice connection library (e.g. `@discordjs/voice` + `distube`, `lavalink-client`, or `erela.js`). The reference bot uses a custom integration.
- Last.fm requires an API key from `https://www.last.fm/api/account/create`.
- Spotify OAuth requires registering an app at `https://developer.spotify.com/dashboard` and setting up a redirect URI.
- The `$fmcharts` and `$fmprofile` commands use `@napi-rs/canvas` for image generation (already a dependency in Cassie).
- Music and Last.fm are independent features — Last.fm can be added without music support.
