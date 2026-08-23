// xoxo/helpers/placeholders.ts
//
// Resolves placeholder tokens in saved message/embed/cv2 payloads.
//
// Supported placeholders:
//
//   User
//   ─────────────────────────────────────────────────────
//   ${user_name}           → username (no discriminator)
//   ${user_display_name}   → guild nickname, falls back to global display name, then username
//   ${user_mention}        → <@userId>
//   ${user_id}             → userId
//   ${user_tag}            → username (modern Discord dropped discriminators)
//   ${user_avatar}         → avatar URL (png, 256px)
//   ${user_avatar_gif}     → animated avatar URL if animated, else png
//   ${user_banner}         → banner URL if set, else empty string
//   ${user_created_at}     → account creation date (YYYY-MM-DD)
//   ${user_joined_at}      → guild join date (YYYY-MM-DD), empty if unavailable
//   ${user_roles}          → comma-separated list of role names (excl. @everyone)
//   ${user_highest_role}   → name of the highest non-@everyone role, else "No role"
//   ${user_is_bot}         → "Yes" / "No"
//   ${user_birthday}       → saved birthday date, or empty when unset
//   ${user_age}             → current age if a birth year was provided
//
//   Server
//   ─────────────────────────────────────────────────────
//   ${server_name}         → guild name
//   ${server_id}           → guild id
//   ${server_icon}         → icon URL (png, 256px), empty if no icon
//   ${server_member_count} → total member count
//   ${server_owner_id}     → guild owner user ID
//   ${server_owner_mention}→ <@ownerId>
//   ${server_created_at}   → guild creation date (YYYY-MM-DD)
//   ${server_boost_count}  → number of boosts
//   ${server_boost_tier}   → boost tier (0–3)
//   ${server_membercount_ordinal} → member count as ordinal (e.g. 1st, 2nd, 3rd, 40th)
//
//   Channel
//   ─────────────────────────────────────────────────────
//   ${channel_name}        → channel name
//   ${channel_id}          → channel id
//   ${channel_mention}     → <#channelId>
//
//   Time
//   ─────────────────────────────────────────────────────
//   ${timestamp}           → Unix timestamp (seconds)
//   ${date}                → YYYY-MM-DD
//   ${time}                → HH:MM
//   ${datetime}            → YYYY-MM-DD HH:MM
//   ${discord_ts}          → Discord <t:unix:F> long date+time
//   ${discord_ts_relative} → Discord <t:unix:R> relative time
//
//   Bot
//   ─────────────────────────────────────────────────────
//   ${bot_name}            → bot username
//   ${bot_mention}         → <@botId>
//   ${bot_id}              → bot application/client ID
//   ${bot_avatar}          → bot avatar URL
//
//   Misc
//   ─────────────────────────────────────────────────────
//   ${newline}             → actual newline character
//   ${zero_width}          → zero-width space (useful for empty embed fields)

export interface PlaceholderContext {
  /** The user who triggered the command / will receive the message. */
  user: any;
  /** Guild member object for `user` (may be null if outside a guild). */
  member?: any | null;
  /** The channel the command was run in. */
  channel?: any | null;
  /** The guild. */
  guild?: any | null;
  /** The bot client. */
  client: any;
  /** Birthday date to expose through user birthday placeholders. */
  birthdayDate?: string | null;
  /** Current age when the saved birthday includes a birth year. */
  userAge?: number | null;
  birthdayDay?: number | null;
  birthdayMonth?: number | null;
  birthdayYear?: number | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function fmtDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function ordinal(n: number): string {
  const abs = Math.abs(n);
  const mod100 = abs % 100;
  const mod10  = abs % 10;
  // 11–13 always use "th" (special case)
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  if (mod10 === 1) return `${n}st`;
  if (mod10 === 2) return `${n}nd`;
  if (mod10 === 3) return `${n}rd`;
  return `${n}th`;
}

function avatarUrl(user: any, animated = false): string {
  if (!user) return '';
  try {
    if (animated && user.avatar?.startsWith('a_')) {
      return user.displayAvatarURL({ extension: 'gif', size: 256 });
    }
    return user.displayAvatarURL({ extension: 'png', size: 256 });
  } catch {
    return '';
  }
}

function calculateAge(
  day: number | null | undefined,
  month: number | null | undefined,
  year: number | null | undefined,
  now: Date,
): string {
  if (!day || !month || !year) return '';
  const age = now.getUTCFullYear() - Number(year) - (
    now.getUTCMonth() + 1 < Number(month) ||
    (now.getUTCMonth() + 1 === Number(month) && now.getUTCDate() < Number(day))
      ? 1
      : 0
  );
  return age >= 0 ? String(age) : '';
}

// ─────────────────────────────────────────────────────────────────────────────
// Build the replacement map from context
// ─────────────────────────────────────────────────────────────────────────────

function buildMap(ctx: PlaceholderContext): Record<string, string> {
  const { user, member, channel, guild, client } = ctx;
  const now = new Date();
  const unixSec = Math.floor(now.getTime() / 1000);

  // ── User ──────────────────────────────────────────────────────────────────
  const userName        = user?.username       ?? '';
  const userDisplayName = member?.nickname ?? user?.globalName ?? user?.username ?? '';
  const userId          = user?.id             ?? '';
  const userMention     = userId ? `<@${userId}>` : '';
  const userAvatar      = avatarUrl(user, false);
  const userAvatarGif   = avatarUrl(user, true);
  const userCreatedAt   = user?.createdAt ? fmtDate(new Date(user.createdAt)) : '';
  const userJoinedAt    = member?.joinedAt ? fmtDate(new Date(member.joinedAt)) : '';
  const userIsBot       = user?.bot ? 'Yes' : 'No';
  const userBanner: string = (() => {
    try {
      return user?.bannerURL?.({ size: 512 }) ?? '';
    } catch {
      return '';
    }
  })();
  const userRoles: string = (() => {
    try {
      const roles: string[] = [];
      member?.roles?.cache?.forEach((r: any) => {
        if (r.name !== '@everyone') roles.push(r.name);
      });
      return roles.join(', ') || 'None';
    } catch {
      return 'None';
    }
  })();
  const userHighestRole: string = (() => {
    try {
      const highest = member?.roles?.highest;
      return (highest && highest.name !== '@everyone') ? highest.name : 'No role';
    } catch {
      return 'No role';
    }
  })();

  // ── Server ────────────────────────────────────────────────────────────────
  const serverName        = guild?.name         ?? '';
  const serverId          = guild?.id           ?? '';
  const serverIcon: string = (() => {
    try { return guild?.iconURL?.({ extension: 'png', size: 256 }) ?? ''; }
    catch { return ''; }
  })();
  const serverMemberCount        = String(guild?.memberCount ?? 0);
  const serverMemberCountOrdinal = ordinal(guild?.memberCount ?? 0);
  const serverOwnerId     = guild?.ownerId      ?? '';
  const serverOwnerMention = serverOwnerId ? `<@${serverOwnerId}>` : '';
  const serverCreatedAt   = guild?.createdAt ? fmtDate(new Date(guild.createdAt)) : '';
  const serverBoostCount  = String(guild?.premiumSubscriptionCount ?? 0);
  const serverBoostTier   = String(guild?.premiumTier ?? 0);

  // ── Channel ───────────────────────────────────────────────────────────────
  const channelName    = channel?.name ?? '';
  const channelId      = channel?.id   ?? '';
  const channelMention = channelId ? `<#${channelId}>` : '';

  // ── Time ──────────────────────────────────────────────────────────────────
  const isoFull  = now.toISOString();
  const datePart = isoFull.slice(0, 10);
  const timePart = now.toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

  // ── Bot ───────────────────────────────────────────────────────────────────
  const botUser    = client?.user;
  const botName    = botUser?.username ?? '';
  const botId      = botUser?.id       ?? '';
  const botMention = botId ? `<@${botId}>` : '';
  const botAvatar  = avatarUrl(botUser, false);

  return {
    // User
    '${user_name}':           userName,
    '${user_display_name}':   userDisplayName,
    '${user_mention}':        userMention,
    '${user_id}':             userId,
    '${user_tag}':            userName,
    '${user_avatar}':         userAvatar,
    '${user_avatar_gif}':     userAvatarGif,
    '${user_banner}':         userBanner,
    '${user_created_at}':     userCreatedAt,
    '${user_joined_at}':      userJoinedAt,
    '${user_roles}':          userRoles,
    '${user_highest_role}':   userHighestRole,
    '${user_is_bot}':         userIsBot,
    '${user_birthday}':       ctx.birthdayDate ?? '',
    '${user_age}':             ctx.userAge === null || ctx.userAge === undefined
      ? calculateAge(ctx.birthdayDay, ctx.birthdayMonth, ctx.birthdayYear, now)
      : String(ctx.userAge),

    // Server
    '${server_name}':          serverName,
    '${server_id}':            serverId,
    '${server_icon}':          serverIcon,
    '${server_member_count}':          serverMemberCount,
    '${server_membercount_ordinal}':   serverMemberCountOrdinal,
    '${server_owner_id}':      serverOwnerId,
    '${server_owner_mention}': serverOwnerMention,
    '${server_created_at}':    serverCreatedAt,
    '${server_boost_count}':   serverBoostCount,
    '${server_boost_tier}':    serverBoostTier,

    // Channel
    '${channel_name}':    channelName,
    '${channel_id}':      channelId,
    '${channel_mention}': channelMention,

    // Time
    '${timestamp}':           String(unixSec),
    '${date}':                datePart,
    '${time}':                timePart,
    '${datetime}':            `${datePart} ${timePart}`,
    '${discord_ts}':          `<t:${unixSec}:F>`,
    '${discord_ts_relative}': `<t:${unixSec}:R>`,

    // Bot
    '${bot_name}':    botName,
    '${bot_mention}': botMention,
    '${bot_id}':      botId,
    '${bot_avatar}':  botAvatar,

    // Misc
    '${newline}':    '\n',
    '${zero_width}': '\u200B',
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Replace all `${placeholder}` tokens in `text` using values from `ctx`.
 * Unknown tokens are left as-is.
 */
export function resolvePlaceholders(text: string, ctx: PlaceholderContext): string {
  const map = buildMap(ctx);
  // Replace all known tokens in a single pass using a global regex
  return text.replace(/\$\{[^}]+\}/g, (token) => map[token] ?? token);
}

/**
 * Returns a formatted list of all supported placeholders with short descriptions.
 * Useful for help text or info embeds.
 */
export function getPlaceholderList(): string {
  return [
    '**User**',
    '`${user_name}` — username',
    '`${user_display_name}` — guild nickname / global display name',
    '`${user_mention}` — @mention',
    '`${user_id}` — user ID',
    '`${user_tag}` — same as user_name (modern Discord)',
    '`${user_avatar}` — avatar URL (PNG)',
    '`${user_avatar_gif}` — animated avatar URL if animated, else PNG',
    '`${user_banner}` — banner URL (empty if none)',
    '`${user_created_at}` — account creation date (YYYY-MM-DD)',
    '`${user_joined_at}` — server join date (YYYY-MM-DD)',
    '`${user_roles}` — comma-separated role names',
    '`${user_highest_role}` — highest role name',
    '`${user_is_bot}` — Yes / No',
    '`${user_birthday}` — saved birthday date',
    '`${user_age}` — current age if a birth year was provided',
    '',
    '**Server**',
    '`${server_name}` — server name',
    '`${server_id}` — server ID',
    '`${server_icon}` — icon URL',
    '`${server_member_count}` — total members',
    '`${server_owner_id}` — owner user ID',
    '`${server_owner_mention}` — @mention of owner',
    '`${server_created_at}` — creation date (YYYY-MM-DD)',
    '`${server_boost_count}` — number of boosts',
    '`${server_boost_tier}` — boost tier (0–3)',
    '`${server_membercount_ordinal}` — member count as ordinal (1st, 2nd, 3rd, 40th…)',
    '',
    '**Channel**',
    '`${channel_name}` — channel name',
    '`${channel_id}` — channel ID',
    '`${channel_mention}` — #channel mention',
    '',
    '**Time**',
    '`${timestamp}` — Unix timestamp (seconds)',
    '`${date}` — YYYY-MM-DD',
    '`${time}` — HH:MM',
    '`${datetime}` — YYYY-MM-DD HH:MM',
    '`${discord_ts}` — Discord long date+time stamp',
    '`${discord_ts_relative}` — Discord relative time stamp',
    '',
    '**Bot**',
    '`${bot_name}` — bot username',
    '`${bot_mention}` — @mention of bot',
    '`${bot_id}` — bot client ID',
    '`${bot_avatar}` — bot avatar URL',
    '',
    '**Misc**',
    '`${newline}` — newline character',
    '`${zero_width}` — zero-width space',
  ].join('\n');
}
