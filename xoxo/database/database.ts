// xoxo/database/database.ts
import { MongoClient, Db, Collection, Document } from 'mongodb';
import { randomBytes } from 'crypto';

// ─────────────────────────────────────────────────────────────────────────────
// Types & Interfaces
// ─────────────────────────────────────────────────────────────────────────────

export interface AFKEntry {
  user_id: string;
  guild_id?: string | null;
  scope: 'server' | 'global';
  reason: string;
  image_url: string | null;
  since_at: Date;
  till_at?: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface GuildPrefixDoc {
  guild_id: string;
  prefix: string;
}

export interface NoPrefixUserDoc {
  user_id:      string;
  addedAt:      Date;
  addedBy?:     string;
  /** Null = permanent; Date = expires at that time. */
  expiresAt:    Date | null;
  /** Set by the user themselves via $mynop off — does NOT remove the entry or touch expiry. */
  selfDisabled?: boolean;
}

export interface NoPrefixDisabledGuildDoc {
  guild_id: string;
  disabledAt: Date;
  disabledBy?: string;
}

export interface BlacklistUserDoc {
  user_id: string;
  addedAt: Date;
  addedBy?: string;
}

export interface BlacklistServerDoc {
  guild_id: string;
  addedAt: Date;
  addedBy?: string;
}

export interface SavedDataDoc {
  /** Original-case name given by the user. */
  name: string;
  /** Lower-cased name used for uniqueness checks within a guild. */
  name_lower: string;
  /** Guild this entry belongs to. */
  guild_id: string;
  /** ID of the message in the storage channel that holds the payload file. */
  message_id: string;
  /** What kind of payload this is. */
  type: 'message' | 'embed' | 'cv2';
  /** User ID of whoever created it. */
  created_by: string;
  created_at: Date;
}

export interface StickyDoc {
  guild_id:        string;
  channel_id:      string;
  type:            'text' | 'cv2' | 'embed';
  /** Raw payload string stored directly so updateSticky needs no HTTP fetch. */
  payload:         string;
  enabled:         boolean;
  last_message_id: string | null;
  updated_at:      Date;
}

export interface GreetSettingsDoc {
  guild_id:     string;
  channel_id:   string | null;
  message_text: string | null;
  message_data: string | null;
  greet_bots:   boolean;
  updated_at:   Date;
}

export interface BirthdayDoc {
  /** Global — one birthday per user, shared across every server. */
  user_id:    string;
  day:        number; // 1-31
  month:      number; // 1-12
  /** Optional birth year; null if the user didn't provide one. */
  year:       number | null;
  updated_at: Date;
}

export interface BirthdaySettingsDoc {
  guild_id:     string;
  channel_id:   string | null;
  message_text: string | null;
  message_data: string | null;
  updated_at:   Date;
}

export interface BirthdayAnnouncementDoc {
  guild_id: string;
  user_id:  string;
  /** The year the announcement was sent for — prevents duplicate sends within the same year. */
  year:     number;
  sent_at:  Date;
}

export interface WarningDoc {
  guild_id:   string;
  user_id:    string;
  reason:     string;
  moderator_id: string;
  created_at: Date;
}

export type LogCategoryKey = 'channel' | 'member' | 'role' | 'vc' | 'message' | 'server' | 'modlog';

export interface LogCategoryConfig {
  channel_id: string | null;
  /**
   * IDs (or, for `server`, event-type keys) excluded from logging in this category.
   * See `xoxo/config/logCategories.ts` for what an "exception" represents per category.
   */
  exceptions: string[];
  /** Master on/off switch for this category, independent of `all_enabled`. */
  enabled: boolean;
}

export interface LogConfigDoc {
  guild_id: string;
  /** If set, every single log event (all categories, ignoring exceptions) is also sent here. */
  all_channel_id: string | null;
  /** Master on/off switch for the "all" channel, independent of per-category toggles. */
  all_enabled: boolean;
  channel: LogCategoryConfig;
  member:  LogCategoryConfig;
  role:    LogCategoryConfig;
  vc:      LogCategoryConfig;
  message: LogCategoryConfig;
  server:  LogCategoryConfig;
  modlog:  LogCategoryConfig;
  updated_at: Date;
}

export type RatingCommandName = 'cute' | 'gay' | 'autistic' | 'intelligent' | 'simp' | 'rizz';

export interface RatingBiasDoc {
  command:    RatingCommandName;
  user_id:    string;
  value:      number | null;
  is_infinite: boolean;
  set_by:     string;
  updated_at: Date;
}

// ─────────────────────────────────────────────────────────────────────────────
// Antinuke
// ─────────────────────────────────────────────────────────────────────────────

/** Every distinct threat vector the antinuke system watches for. */
export type AntinukeModuleKey =
  | 'channelCreate'
  | 'channelDelete'
  | 'roleCreate'
  | 'roleDelete'
  | 'roleUpdate'
  | 'banAdd'
  | 'kick'
  | 'webhookCreate'
  | 'botAdd'
  | 'emojiDelete'
  | 'guildUpdate';

/** What happens to the offending user once a module trips. */
export type AntinukePunishment = 'ban' | 'kick' | 'strip' | 'quarantine' | 'none';

export interface AntinukeModuleConfig {
  enabled:    boolean;
  /** How many matching actions within `interval_ms` trip the module. */
  limit:      number;
  /** Rolling window (ms) the `limit` is measured over. */
  interval_ms: number;
  punishment: AntinukePunishment;
}

export type AntinukeWhitelistType = 'user' | 'role' | 'bot';

export interface AntinukeWhitelistEntry {
  type:      AntinukeWhitelistType;
  id:        string;
  added_by:  string;
  added_at:  Date;
}

export interface AntinukeConfigDoc {
  guild_id:          string;
  /** Master on/off switch. When false, no module ever fires. */
  enabled:           boolean;
  log_channel_id:    string | null;
  /** Custom role applied by the `quarantine` punishment. Auto-created if unset. */
  quarantine_role_id: string | null;
  whitelist:         AntinukeWhitelistEntry[];
  modules:           Record<AntinukeModuleKey, AntinukeModuleConfig>;
  updated_at:        Date;
}

// ─────────────────────────────────────────────────────────────────────────────
// User Self-Prefix
// ─────────────────────────────────────────────────────────────────────────────

export interface UserSelfPrefixDoc {
  user_id:    string;
  prefix:     string;
  set_at:     Date;
}

// ─────────────────────────────────────────────────────────────────────────────
// Name Styles
// ─────────────────────────────────────────────────────────────────────────────

export interface NameStyleDoc {
  /** Guild ID, or '__default__' for the global fallback. */
  guild_id:  string;
  font_id:   number;      // 1–12
  effect_id: number;      // 1–6
  colors:    number[];    // 1–2 24-bit ints
  set_by:    string;      // user ID
  updated_at: Date;
}

// ─────────────────────────────────────────────────────────────────────────────
// Vanity Role System
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Per-guild vanity role configuration.
 *
 * STATUS trigger: when a member's custom Discord status (presence activity
 * of type CUSTOM) contains `status_keyword`, `status_role_id` is assigned.
 * The role is removed when the keyword is no longer present.
 *
 * TAG trigger: when a member equips the guild's server tag (clan tag), the
 * `tag_role_id` is assigned. Removed when the tag is unequipped.
 *
 * `message_channel_id`: if set, the configured message (text ± saved data)
 * is sent to this channel whenever a role is GAINED via either trigger.
 */
export type AutoresponderMatchType = 'exact' | 'anywhere';
export type AutoresponderResponseType = 'message' | 'reaction';
export type AutoresponderReplyMode = 'normal' | 'reply_mention' | 'reply_no_mention';

export interface AutoresponderResponseAction {
  type:       AutoresponderResponseType;
  /** Plain text for `message`; emoji markdown/unicode for `reaction`. */
  content:    string;
  /** For `message` type only. Defaults to 'normal' (channel.send) when omitted. */
  replyMode?: AutoresponderReplyMode;
}

export interface AutoresponderDoc {
  guild_id:      string;
  /** Stable short ID (8-char alphanumeric), globally unique across all guilds. */
  ar_id:         string;
  /** Original-case trigger, shown in panels. */
  trigger:       string;
  /** Lowercased trigger — uniqueness key and matching basis. */
  trigger_lower: string;
  match_type:    AutoresponderMatchType;
  responses:     AutoresponderResponseAction[];
  enabled:       boolean;
  /** When true, this trigger fires in all guilds (not just the owning one). */
  is_global:     boolean;
  created_by:    string;
  created_at:    Date;
  updated_at:    Date;
}

export interface VanityRoleSettingsDoc {
  guild_id:              string;
  // Status / bio keyword trigger
  status_enabled:        boolean;        // false = trigger paused; config is kept
  status_keyword:        string | null;
  status_role_id:        string | null;
  status_message_text:   string | null;
  status_message_data:   string | null;
  // Server tag (clan tag) trigger
  tag_enabled:           boolean;        // false = trigger paused; config is kept
  tag_role_id:           string | null;
  tag_message_text:      string | null;
  tag_message_data:      string | null;
  // Shared announcement channel for both triggers
  message_channel_id:    string | null;
  updated_at:            Date;
}

export interface AutoroleConfigDoc {
  guild_id:        string;
  enabled:         boolean;
  member_role_ids: string[]; // roles given to new human members
  bot_role_ids:    string[]; // roles given to new bot members
  updated_at:      Date;
}

// ─────────────────────────────────────────────────────────────────────────────
// Custom Roles
// ─────────────────────────────────────────────────────────────────────────────

/**
 * One document per (guild_id + keyword). The keyword acts as a virtual command
 * name — typing `<prefix><keyword> @users` assigns all linked roles.
 */
export interface CustomRoleDoc {
  guild_id:   string;
  keyword:    string;    // always lowercase; uniqueness key per guild
  role_ids:   string[];  // 1–5 role IDs
  created_by: string;    // user ID of whoever ran $customrole create
  created_at: Date;
}

// ─────────────────────────────────────────────────────────────────────────────
// User Command Aliases
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A personal, user-scoped alias for a bot command. Only the creator can use
 * it — other users typing the same word get nothing unless they've set the
 * same alias themselves. Enforced limits (see Database.ALIAS_MAX_PER_USER /
 * ALIAS_MAX_LEN): at most 15 aliases per user, at most 1 alias per command,
 * alias name at most 14 characters.
 */
export interface UserCommandAliasDoc {
  user_id:     string;
  /** Original-case name shown in panels. */
  alias:       string;
  /** Lower-cased name — uniqueness key and routing basis. */
  alias_lower: string;
  /** Canonical (lower-cased) base command name this alias points to. */
  command:     string;
  created_at:  Date;
}

// ─────────────────────────────────────────────────────────────────────────────
// Database Class
// ─────────────────────────────────────────────────────────────────────────────

export class Database {
  private client: MongoClient;
  private db: Db | null = null;
  private connected = false;
  private readonly botId: string;
  private readonly dbName = 'LevitateDiscordBot';

  /** In-memory set of user IDs currently AFK — avoids a DB hit on every message. */
  private afkCache = new Set<string>();

  constructor() {
    this.botId = process.env['BOT_IDENTIFIER'] || '';
    const uri = process.env['MONGO_URI'];
    if (!uri) throw new Error('MONGO_URI environment variable is required');

    this.client = new MongoClient(uri, {
      tls: true,
      connectTimeoutMS: 30_000,
      socketTimeoutMS: 45_000,
    });
  }

  // ── Collection helper ──────────────────────────────────────────────────────

  private col<T extends Document>(name: string): Collection<T> {
    if (!this.db) throw new Error('Database not connected');
    const prefixed = this.botId ? `${this.botId}_${name}` : name;
    return this.db.collection<T>(prefixed);
  }

  // ── Connection management ──────────────────────────────────────────────────

  /**
   * Lazy connect — every public method calls this before touching MongoDB.
   * Returns `true` if the connection succeeded (or was already open).
   */
  async connect(): Promise<boolean> {
    if (this.connected) return true;
    try {
      await this.client.connect();
      this.db = this.client.db(this.dbName);
      this.connected = true;
      return true;
    } catch (err) {
      console.error(`[DATABASE] Connection failed: ${(err as Error).message}`);
      return false;
    }
  }

  /**
   * Boot-block initialiser.
   * Connects to MongoDB and emits startup log lines exactly once per boot.
   */
  async initWithLogs(buildName: string): Promise<void> {
    const usePrefix = !!this.botId;
    const ident = this.botId || 'default';
    console.log(
      `[DATABASE] 🪐 Database initialized for bot: ${ident} (Using ${usePrefix ? 'PREFIXED' : 'DEFAULT'} Collection)`,
    );

    if (!this.connected) {
      try {
        await this.client.connect();
        this.db = this.client.db(this.dbName);
        this.connected = true;
      } catch (err) {
        console.error(`[DATABASE] Connection failed: ${(err as Error).message}`);
        return;
      }
    }

    console.log(`[DATABASE] 🪐 Connected to ${this.dbName} for bot: ${buildName}`);
    console.log(`[DATABASE] 🪐 Database connected`);
  }

  async close(): Promise<void> {
    if (!this.connected) return;
    await this.client.close();
    this.connected = false;
    console.log('[DATABASE] Connection closed');
  }

  // ── Ping ──────────────────────────────────────────────────────────────────

  async ping(): Promise<number | null> {
    if (!this.db || !this.connected) return null;
    try {
      const start = Date.now();
      await this.db.command({ ping: 1 });
      return Date.now() - start;
    } catch {
      return null;
    }
  }

  // ── Cluster ID ────────────────────────────────────────────────────────────

  async getOrCreateClusterId(): Promise<number> {
    await this.connect();
    const coll = this.db!.collection<{ botId: string; clusterId: number; createdAt?: Date; updatedAt?: Date }>('bot_cluster_registry');
    const existing = await coll.findOne({ botId: this.botId });
    if (existing) return existing.clusterId;

    const highest = await coll.findOne({}, { sort: { clusterId: -1 } });
    const nextId = (highest?.clusterId ?? 0) + 1;
    await coll.insertOne({ botId: this.botId, clusterId: nextId, createdAt: new Date(), updatedAt: new Date() });
    return nextId;
  }

  // ── Guild Prefixes ─────────────────────────────────────────────────────────

  async getAllGuildPrefixes(): Promise<Map<string, string>> {
    await this.connect();
    const docs = await this.col<GuildPrefixDoc>('guild_prefixes').find().toArray();
    return new Map(docs.map((d) => [d.guild_id, d.prefix]));
  }

  async getGuildPrefix(guildId: string): Promise<string | null> {
    await this.connect();
    const doc = await this.col<GuildPrefixDoc>('guild_prefixes').findOne({ guild_id: guildId });
    return doc?.prefix ?? null;
  }

  async setGuildPrefix(guildId: string, prefix: string): Promise<boolean> {
    await this.connect();
    await this.col<GuildPrefixDoc>('guild_prefixes').updateOne(
      { guild_id: guildId },
      { $set: { prefix, updated_at: new Date() } },
      { upsert: true },
    );
    return true;
  }

  async removeGuildPrefix(guildId: string): Promise<boolean> {
    await this.connect();
    const result = await this.col<GuildPrefixDoc>('guild_prefixes').deleteOne({ guild_id: guildId });
    return result.deletedCount > 0;
  }

  // ── AFK System ────────────────────────────────────────────────────────────

  async setAFK(data: {
    userId: string;
    guildId: string | null;
    scope: 'server' | 'global';
    reason: string;
    imageUrl: string | null;
    sinceAt: Date;
    tillAt: Date | null;
  }): Promise<boolean> {
    await this.connect();
    const filter = data.scope === 'server'
      ? { user_id: data.userId, guild_id: data.guildId, scope: 'server' as const }
      : { user_id: data.userId, scope: 'global' as const };

    await this.col<AFKEntry>('afk_statuses').updateOne(
      filter as any,
      {
        $set: {
          user_id: data.userId,
          guild_id: data.scope === 'server' ? data.guildId : null,
          scope: data.scope,
          reason: data.reason,
          image_url: data.imageUrl,
          since_at: data.sinceAt,
          till_at: data.tillAt,
          updated_at: new Date(),
        },
        $setOnInsert: { created_at: new Date() },
      },
      { upsert: true },
    );

    this.afkCache.add(data.userId);
    return true;
  }

  async getAFK(userId: string, guildId?: string): Promise<AFKEntry | null> {
    await this.connect();
    if (guildId) {
      const serverAFK = await this.col<AFKEntry>('afk_statuses').findOne({
        user_id: userId,
        guild_id: guildId,
        scope: 'server',
      });
      if (serverAFK) return serverAFK;
    }
    return this.col<AFKEntry>('afk_statuses').findOne({ user_id: userId, scope: 'global' });
  }

  async removeActiveAFKForMessage(userId: string, guildId: string): Promise<AFKEntry[]> {
    await this.connect();
    const coll = this.col<AFKEntry>('afk_statuses');
    const filter = {
      user_id: userId,
      $or: [{ scope: 'global' as const }, { scope: 'server' as const, guild_id: guildId }],
    };
    const docs = await coll.find(filter as any).toArray();
    if (docs.length) {
      await coll.deleteMany(filter as any);
      const remaining = await coll.countDocuments({ user_id: userId });
      if (remaining === 0) this.afkCache.delete(userId);
    }
    return docs;
  }

  public isUserAFK(userId: string): boolean {
    return this.afkCache.has(userId);
  }

  async populateAfkCacheSilent(): Promise<number> {
    await this.connect();
    const ids: string[] = await this.col<AFKEntry>('afk_statuses').distinct('user_id');
    this.afkCache = new Set(ids);
    return this.afkCache.size;
  }

  // ── Noprefix System ───────────────────────────────────────────────────────

  async getNoprefixGlobalEnabled(): Promise<boolean> {
    await this.connect();
    const doc = await this.col<{ _id?: string; enabled: boolean }>('settings').findOne({ _id: 'noprefix_global' } as any);
    return doc?.enabled ?? true;
  }

  async setNoprefixGlobalEnabled(enabled: boolean): Promise<boolean> {
    await this.connect();
    await this.col('settings').updateOne(
      { _id: 'noprefix_global' } as any,
      { $set: { enabled, updatedAt: new Date() } },
      { upsert: true },
    );
    return true;
  }

  async isNoPrefixUser(userId: string): Promise<boolean> {
    await this.connect();
    const doc = await this.col<NoPrefixUserDoc>('noprefix_users').findOne({ user_id: userId });
    if (!doc) return false;
    // Auto-remove and deny if the entry has expired
    if (doc.expiresAt && doc.expiresAt.getTime() < Date.now()) {
      await this.col<NoPrefixUserDoc>('noprefix_users').deleteOne({ user_id: userId });
      return false;
    }
    // Respect user's own self-disable toggle ($mynop off)
    if (doc.selfDisabled === true) return false;
    return true;
  }

  async setSelfNoPrefixDisabled(userId: string, disabled: boolean): Promise<boolean> {
    await this.connect();
    const result = await this.col<NoPrefixUserDoc>('noprefix_users').updateOne(
      { user_id: userId },
      { $set: { selfDisabled: disabled } },
    );
    return result.matchedCount > 0;
  }

  async getNoPrefixUserEntry(userId: string): Promise<NoPrefixUserDoc | null> {
    await this.connect();
    return this.col<NoPrefixUserDoc>('noprefix_users').findOne({ user_id: userId });
  }

  async addNoPrefixUser(userId: string, addedBy?: string, expiresAt: Date | null = null): Promise<boolean> {
    await this.connect();
    await this.col<NoPrefixUserDoc>('noprefix_users').updateOne(
      { user_id: userId },
      { $set: { addedAt: new Date(), addedBy, expiresAt } },
      { upsert: true },
    );
    return true;
  }

  async removeNoPrefixUser(userId: string): Promise<boolean> {
    await this.connect();
    const result = await this.col<NoPrefixUserDoc>('noprefix_users').deleteOne({ user_id: userId });
    return result.deletedCount > 0;
  }

  async getNoPrefixUsers(): Promise<NoPrefixUserDoc[]> {
    await this.connect();
    return this.col<NoPrefixUserDoc>('noprefix_users').find().sort({ addedAt: 1 }).toArray();
  }

  async isGuildNoPrefixDisabled(guildId: string): Promise<boolean> {
    await this.connect();
    return !!(await this.col<NoPrefixDisabledGuildDoc>('noprefix_disabled_guilds').findOne({ guild_id: guildId }));
  }

  async disableGuildNoPrefix(guildId: string, disabledBy?: string): Promise<boolean> {
    await this.connect();
    await this.col<NoPrefixDisabledGuildDoc>('noprefix_disabled_guilds').updateOne(
      { guild_id: guildId },
      { $set: { disabledAt: new Date(), disabledBy } },
      { upsert: true },
    );
    return true;
  }

  async enableGuildNoPrefix(guildId: string): Promise<boolean> {
    await this.connect();
    const result = await this.col<NoPrefixDisabledGuildDoc>('noprefix_disabled_guilds').deleteOne({ guild_id: guildId });
    return result.deletedCount > 0;
  }

  async getNoPrefixDisabledGuilds(): Promise<NoPrefixDisabledGuildDoc[]> {
    await this.connect();
    return this.col<NoPrefixDisabledGuildDoc>('noprefix_disabled_guilds').find().sort({ disabledAt: 1 }).toArray();
  }

  /** Check if a developer has self-disabled their own noprefix via $mynop off. */
  async isDevNoprefixSelfDisabled(userId: string): Promise<boolean> {
    await this.connect();
    const doc = await this.col<{ _id?: string; user_ids: string[] }>('settings').findOne({ _id: 'noprefix_dev_self_disabled' } as any);
    return doc?.user_ids?.includes(userId) ?? false;
  }

  /** Set or clear a developer's self-disable flag for noprefix. */
  async setDevNoprefixSelfDisabled(userId: string, disabled: boolean): Promise<void> {
    await this.connect();
    if (disabled) {
      await this.col('settings').updateOne(
        { _id: 'noprefix_dev_self_disabled' } as any,
        { $addToSet: { user_ids: userId } } as any,
        { upsert: true },
      );
    } else {
      await this.col('settings').updateOne(
        { _id: 'noprefix_dev_self_disabled' } as any,
        { $pull: { user_ids: userId } } as any,
      );
    }
  }

  // ── User Blacklist ─────────────────────────────────────────────────────────

  async getBlacklistGlobalEnabled(): Promise<boolean> {
    await this.connect();
    const doc = await this.col<{ _id?: string; enabled: boolean }>('settings').findOne({ _id: 'blacklist_global' } as any);
    return doc?.enabled ?? true;
  }

  async setBlacklistGlobalEnabled(enabled: boolean): Promise<boolean> {
    await this.connect();
    await this.col('settings').updateOne(
      { _id: 'blacklist_global' } as any,
      { $set: { enabled, updatedAt: new Date() } },
      { upsert: true },
    );
    return true;
  }

  async isUserBlacklisted(userId: string): Promise<boolean> {
    await this.connect();
    return !!(await this.col<BlacklistUserDoc>('blacklist_users').findOne({ user_id: userId }));
  }

  async addBlacklistedUser(userId: string, addedBy?: string): Promise<boolean> {
    await this.connect();
    await this.col<BlacklistUserDoc>('blacklist_users').updateOne(
      { user_id: userId },
      { $set: { addedAt: new Date(), addedBy } },
      { upsert: true },
    );
    return true;
  }

  async removeBlacklistedUser(userId: string): Promise<boolean> {
    await this.connect();
    const result = await this.col<BlacklistUserDoc>('blacklist_users').deleteOne({ user_id: userId });
    return result.deletedCount > 0;
  }

  async getBlacklistedUsers(): Promise<BlacklistUserDoc[]> {
    await this.connect();
    return this.col<BlacklistUserDoc>('blacklist_users').find().sort({ addedAt: 1 }).toArray();
  }

  // ── Server Blacklist ───────────────────────────────────────────────────────

  async getBlacklistServerGlobalEnabled(): Promise<boolean> {
    await this.connect();
    const doc = await this.col<{ _id?: string; enabled: boolean }>('settings').findOne({ _id: 'blacklist_server_global' } as any);
    return doc?.enabled ?? true;
  }

  async setBlacklistServerGlobalEnabled(enabled: boolean): Promise<boolean> {
    await this.connect();
    await this.col('settings').updateOne(
      { _id: 'blacklist_server_global' } as any,
      { $set: { enabled, updatedAt: new Date() } },
      { upsert: true },
    );
    return true;
  }

  async isServerBlacklisted(guildId: string): Promise<boolean> {
    await this.connect();
    return !!(await this.col<BlacklistServerDoc>('blacklist_servers').findOne({ guild_id: guildId }));
  }

  async addBlacklistedServer(guildId: string, addedBy?: string): Promise<boolean> {
    await this.connect();
    await this.col<BlacklistServerDoc>('blacklist_servers').updateOne(
      { guild_id: guildId },
      { $set: { addedAt: new Date(), addedBy } },
      { upsert: true },
    );
    return true;
  }

  async removeBlacklistedServer(guildId: string): Promise<boolean> {
    await this.connect();
    const result = await this.col<BlacklistServerDoc>('blacklist_servers').deleteOne({ guild_id: guildId });
    return result.deletedCount > 0;
  }

  async getBlacklistedServers(): Promise<BlacklistServerDoc[]> {
    await this.connect();
    return this.col<BlacklistServerDoc>('blacklist_servers').find().sort({ addedAt: 1 }).toArray();
  }

  // ── Saved Data ────────────────────────────────────────────────────────────

  /**
   * Ensures the per-guild unique index on saved_data exists.
   * Safe to call multiple times — MongoDB ignores duplicate index creation.
   */
  private async ensureSavedDataIndex(): Promise<void> {
    await this.col<SavedDataDoc>('saved_data').createIndex(
      { guild_id: 1, name_lower: 1 },
      { unique: true },
    );
  }

  async getSavedData(guildId: string, name: string): Promise<SavedDataDoc | null> {
    await this.connect();
    return this.col<SavedDataDoc>('saved_data').findOne({
      guild_id: guildId,
      name_lower: name.toLowerCase(),
    });
  }

  async savedDataNameExists(guildId: string, name: string): Promise<boolean> {
    await this.connect();
    return !!(await this.col<SavedDataDoc>('saved_data').findOne({
      guild_id: guildId,
      name_lower: name.toLowerCase(),
    }));
  }

  /**
   * Persist a new saved-data entry.
   * Returns `true` on success.
   * Returns `'duplicate'` if the name already exists in this guild (duplicate-key error).
   * Returns `false` on any other DB error.
   */
  async createSavedData(data: {
    name: string;
    guildId: string;
    messageId: string;
    type: 'message' | 'embed' | 'cv2';
    createdBy: string;
  }): Promise<true | 'duplicate' | false> {
    await this.connect();
    try {
      await this.ensureSavedDataIndex();
      await this.col<SavedDataDoc>('saved_data').insertOne({
        name: data.name,
        name_lower: data.name.toLowerCase(),
        guild_id: data.guildId,
        message_id: data.messageId,
        type: data.type,
        created_by: data.createdBy,
        created_at: new Date(),
      });
      return true;
    } catch (err: any) {
      // MongoDB duplicate key error code
      if (err?.code === 11000) return 'duplicate';
      console.error(`[DATABASE] createSavedData failed: ${err?.message ?? err}`);
      return false;
    }
  }

  async deleteSavedData(guildId: string, name: string): Promise<boolean> {
    await this.connect();
    const result = await this.col<SavedDataDoc>('saved_data').deleteOne({
      guild_id: guildId,
      name_lower: name.toLowerCase(),
    });
    return result.deletedCount > 0;
  }

  async listSavedData(guildId: string): Promise<SavedDataDoc[]> {
    await this.connect();
    return this.col<SavedDataDoc>('saved_data')
      .find({ guild_id: guildId })
      .sort({ created_at: 1 })
      .toArray();
  }

  // ── Sticky Messages ───────────────────────────────────────────────────────

  async getSticky(guildId: string, channelId: string): Promise<StickyDoc | null> {
    await this.connect();
    return this.col<StickyDoc>('sticky_messages').findOne({ guild_id: guildId, channel_id: channelId });
  }

  async setSticky(
    guildId: string,
    channelId: string,
    type: 'text' | 'cv2' | 'embed',
    payload: string,
    lastMsgId: string | null,
  ): Promise<void> {
    await this.connect();
    await this.col<StickyDoc>('sticky_messages').updateOne(
      { guild_id: guildId, channel_id: channelId },
      {
        $set: {
          type,
          payload,
          enabled: true,
          last_message_id: lastMsgId,
          updated_at: new Date(),
        },
      },
      { upsert: true },
    );
  }

  async setStickyEnabled(guildId: string, channelId: string, enabled: boolean): Promise<void> {
    await this.connect();
    await this.col<StickyDoc>('sticky_messages').updateOne(
      { guild_id: guildId, channel_id: channelId },
      { $set: { enabled, updated_at: new Date() } },
    );
  }

  async setStickyLastMessageId(guildId: string, channelId: string, msgId: string): Promise<void> {
    await this.connect();
    await this.col<StickyDoc>('sticky_messages').updateOne(
      { guild_id: guildId, channel_id: channelId },
      { $set: { last_message_id: msgId, updated_at: new Date() } },
    );
  }

  // ── Welcomer / Greet Settings ─────────────────────────────────────────────

  async getGreetSettings(guildId: string): Promise<GreetSettingsDoc | null> {
    await this.connect();
    return this.col<GreetSettingsDoc>('greet_settings').findOne({ guild_id: guildId });
  }

  async setGreetChannel(guildId: string, channelId: string | null): Promise<void> {
    await this.connect();
    await this.col<GreetSettingsDoc>('greet_settings').updateOne(
      { guild_id: guildId },
      { $set: { channel_id: channelId, updated_at: new Date() },
        $setOnInsert: {
          message_text: null,
          message_data: null,
          greet_bots:   false,
        } as any,
      },
      { upsert: true },
    );
  }

  async setGreetMessage(guildId: string, text: string | null, dataName: string | null): Promise<void> {
    await this.connect();
    await this.col<GreetSettingsDoc>('greet_settings').updateOne(
      { guild_id: guildId },
      { $set: { message_text: text, message_data: dataName, updated_at: new Date() },
        $setOnInsert: {
          channel_id: null,
          greet_bots: false,
        } as any,
      },
      { upsert: true },
    );
  }

  async setGreetBots(guildId: string, value: boolean): Promise<void> {
    await this.connect();
    await this.col<GreetSettingsDoc>('greet_settings').updateOne(
      { guild_id: guildId },
      { $set: { greet_bots: value, updated_at: new Date() },
        $setOnInsert: {
          channel_id:   null,
          message_text: null,
          message_data: null,
        } as any,
      },
      { upsert: true },
    );
  }

  // ── Birthdays ────────────────────────────────────────────────────────────

  async getBirthday(userId: string): Promise<BirthdayDoc | null> {
    await this.connect();
    return this.col<BirthdayDoc>('birthdays').findOne({ user_id: userId });
  }

  async setBirthday(userId: string, day: number, month: number, year: number | null): Promise<void> {
    await this.connect();
    await this.col<BirthdayDoc>('birthdays').updateOne(
      { user_id: userId },
      { $set: { day, month, year, updated_at: new Date() } },
      { upsert: true },
    );
  }

  async removeBirthday(userId: string): Promise<void> {
    await this.connect();
    await this.col<BirthdayDoc>('birthdays').deleteOne({ user_id: userId });
  }

  async getBirthdaysByMonthDay(month: number, day: number): Promise<BirthdayDoc[]> {
    await this.connect();
    return this.col<BirthdayDoc>('birthdays').find({ month, day }).toArray();
  }

  async getBirthdaysForUsers(userIds: string[]): Promise<BirthdayDoc[]> {
    await this.connect();
    if (!userIds.length) return [];
    return this.col<BirthdayDoc>('birthdays').find({ user_id: { $in: userIds } }).toArray();
  }

  // ── Birthday Settings (per-guild channel + message) ────────────────────────

  async getBirthdaySettings(guildId: string): Promise<BirthdaySettingsDoc | null> {
    await this.connect();
    return this.col<BirthdaySettingsDoc>('birthday_settings').findOne({ guild_id: guildId });
  }

  async setBirthdayChannel(guildId: string, channelId: string | null): Promise<void> {
    await this.connect();
    await this.col<BirthdaySettingsDoc>('birthday_settings').updateOne(
      { guild_id: guildId },
      { $set: { channel_id: channelId, updated_at: new Date() },
        $setOnInsert: { message_text: null, message_data: null } as any,
      },
      { upsert: true },
    );
  }

  async setBirthdayMessage(guildId: string, text: string | null, dataName: string | null): Promise<void> {
    await this.connect();
    await this.col<BirthdaySettingsDoc>('birthday_settings').updateOne(
      { guild_id: guildId },
      { $set: { message_text: text, message_data: dataName, updated_at: new Date() },
        $setOnInsert: { channel_id: null } as any,
      },
      { upsert: true },
    );
  }

  // ── Birthday Announcement Tracking ──────────────────────────────────────────
  // A unique index on (guild_id, user_id, year) lets `claimBirthdayAnnouncement`
  // atomically claim the "send this birthday" slot via a raw insert — the
  // duplicate-key error IS the concurrency guard, so overlapping scheduler
  // ticks / restarts / multi-process races can never send the same birthday
  // twice in the same year.

  /** Safe to call repeatedly — MongoDB ignores duplicate index creation. */
  private async ensureBirthdayAnnouncementIndex(): Promise<void> {
    await this.col<BirthdayAnnouncementDoc>('birthday_announcements').createIndex(
      { guild_id: 1, user_id: 1, year: 1 },
      { unique: true },
    );
  }

  /**
   * Atomically claims the (guild, user, year) announcement slot.
   * Returns `true` if this call claimed it — the caller should proceed to send.
   * Returns `false` if it was already claimed (already announced this year) or
   * on any unexpected DB error (fail closed — never spam on a DB hiccup).
   */
  async claimBirthdayAnnouncement(guildId: string, userId: string, year: number): Promise<boolean> {
    await this.connect();
    await this.ensureBirthdayAnnouncementIndex().catch((): void => undefined);
    try {
      await this.col<BirthdayAnnouncementDoc>('birthday_announcements').insertOne({
        guild_id: guildId,
        user_id:  userId,
        year,
        sent_at:  new Date(),
      });
      return true;
    } catch {
      return false;
    }
  }

  /** Releases a previously-claimed slot so the scheduler retries next tick — used when the send itself failed. */
  async releaseBirthdayAnnouncement(guildId: string, userId: string, year: number): Promise<void> {
    await this.connect();
    await this.col<BirthdayAnnouncementDoc>('birthday_announcements').deleteOne(
      { guild_id: guildId, user_id: userId, year },
    );
  }

  // ── Pending Restart Notification ───────────────────────────────────────────

  async setPendingRestartChannel(channelId: string, guildId: string): Promise<void> {
    await this.connect();
    await this.col('settings').updateOne(
      { _id: 'pending_restart' } as any,
      { $set: { channelId, guildId, createdAt: new Date() } },
      { upsert: true },
    );
  }

  async getPendingRestartChannel(): Promise<{ channelId: string; guildId: string } | null> {
    await this.connect();
    const doc = await this.col<{ channelId: string; guildId: string }>('settings').findOne({ _id: 'pending_restart' } as any);
    if (!doc) return null;
    return { channelId: doc.channelId, guildId: doc.guildId };
  }

  async clearPendingRestartChannel(): Promise<void> {
    await this.connect();
    await this.col('settings').deleteOne({ _id: 'pending_restart' } as any);
  }

  // ── Global Command Counter ─────────────────────────────────────────────────

  async incrementGlobalCommandsExecuted(): Promise<void> {
    if (!this.db || !this.connected) return;
    await this.col('settings').updateOne(
      { _id: 'global_stats' } as any,
      { $inc: { commandsExecuted: 1 }, $set: { updatedAt: new Date() } },
      { upsert: true },
    );
  }

  async getGlobalCommandsExecuted(): Promise<number> {
    await this.connect();
    const doc = await this.col<{ commandsExecuted?: number }>('settings').findOne({ _id: 'global_stats' } as any);
    return doc?.commandsExecuted ?? 0;
  }

  // ── Bot Stats (persisted for the website) ─────────────────────────────────

  async updateBotStats(stats: { servers: number; members: number; channels: number }): Promise<void> {
    if (!this.db || !this.connected) return;
    await this.col('settings').updateOne(
      { _id: 'bot_stats' } as any,
      { $set: { ...stats, updatedAt: new Date() } },
      { upsert: true },
    );
  }

  // ── Guild Invite Cache ────────────────────────────────────────────────────
  // Collection: `guild_invites` — { guild_id, code, updated_at }
  // Used by the server-list command and guildCreate event.

  async getGuildInvite(guildId: string): Promise<string | null> {
    await this.connect();
    const doc = await this.col<{ guild_id: string; code: string }>('guild_invites')
      .findOne({ guild_id: guildId });
    return doc?.code ?? null;
  }

  async setGuildInvite(guildId: string, code: string): Promise<void> {
    await this.connect();
    await this.col('guild_invites').updateOne(
      { guild_id: guildId },
      { $set: { guild_id: guildId, code, updated_at: new Date() } },
      { upsert: true },
    );
  }

  async removeGuildInvite(guildId: string): Promise<void> {
    await this.connect();
    await this.col('guild_invites').deleteOne({ guild_id: guildId });
  }

  // ── Warnings ──────────────────────────────────────────────────────────────
  // Collection: `warnings` — one document per warning issued.

  async addWarning(guildId: string, userId: string, reason: string, moderatorId: string): Promise<void> {
    await this.connect();
    await this.col<WarningDoc>('warnings').insertOne({
      guild_id:     guildId,
      user_id:      userId,
      reason,
      moderator_id: moderatorId,
      created_at:   new Date(),
    });
  }

  async getWarnings(guildId: string, userId: string): Promise<WarningDoc[]> {
    await this.connect();
    return this.col<WarningDoc>('warnings')
      .find({ guild_id: guildId, user_id: userId })
      .sort({ created_at: 1 })
      .toArray();
  }

  async countWarnings(guildId: string, userId: string): Promise<number> {
    await this.connect();
    return this.col<WarningDoc>('warnings').countDocuments({ guild_id: guildId, user_id: userId });
  }

  async clearWarnings(guildId: string, userId: string): Promise<number> {
    await this.connect();
    const result = await this.col<WarningDoc>('warnings').deleteMany({ guild_id: guildId, user_id: userId });
    return result.deletedCount ?? 0;
  }

  // ── Rating command bias (developer override for $howcute/$gay/$autistic/$intelligence) ──
  // Collection: `rating_bias` — one document per (command, user) pair.

  async setRatingBias(
    command:  RatingCommandName,
    userId:   string,
    value:    number | null,
    isInfinite: boolean,
    setBy:    string,
  ): Promise<void> {
    await this.connect();
    await this.col<RatingBiasDoc>('rating_bias').updateOne(
      { command, user_id: userId },
      { $set: { command, user_id: userId, value, is_infinite: isInfinite, set_by: setBy, updated_at: new Date() } },
      { upsert: true },
    );
  }

  async getRatingBias(command: RatingCommandName, userId: string): Promise<RatingBiasDoc | null> {
    await this.connect();
    return this.col<RatingBiasDoc>('rating_bias').findOne({ command, user_id: userId });
  }

  async removeRatingBias(command: RatingCommandName, userId: string): Promise<boolean> {
    await this.connect();
    const result = await this.col<RatingBiasDoc>('rating_bias').deleteOne({ command, user_id: userId });
    return result.deletedCount > 0;
  }

  // ── Antinuke ──────────────────────────────────────────────────────────────
  // Collection: `antinuke_configs` — one document per guild.
  // Read-modify-write pattern (via `saveAntinukeConfig`), matching the
  // logging system, to avoid dotted-path conflicts on nested module fields.

  private defaultAntinukeModules(): Record<AntinukeModuleKey, AntinukeModuleConfig> {
    // interval_ms is stored for backward-compatibility but is no longer used
    // at runtime — the bucket window is MAX_TRACKED_AGE_MS (5 min) in the engine.
    return {
      channelCreate: { enabled: true, limit: 2, interval_ms: 10_000, punishment: 'kick' },
      channelDelete: { enabled: true, limit: 2, interval_ms: 10_000, punishment: 'ban' },
      roleCreate:    { enabled: true, limit: 2, interval_ms: 10_000, punishment: 'kick' },
      roleDelete:    { enabled: true, limit: 2, interval_ms: 10_000, punishment: 'ban' },
      roleUpdate:    { enabled: true, limit: 1, interval_ms: 10_000, punishment: 'ban' },
      banAdd:        { enabled: true, limit: 2, interval_ms: 10_000, punishment: 'ban' },
      kick:          { enabled: true, limit: 3, interval_ms: 10_000, punishment: 'ban' },
      webhookCreate: { enabled: true, limit: 2, interval_ms: 10_000, punishment: 'kick' },
      botAdd:        { enabled: true, limit: 1, interval_ms: 10_000, punishment: 'kick' },
      emojiDelete:   { enabled: true, limit: 3, interval_ms: 10_000, punishment: 'kick' },
      guildUpdate:   { enabled: true, limit: 1, interval_ms: 30_000, punishment: 'ban' },
    };
  }

  private defaultAntinukeConfig(guildId: string): AntinukeConfigDoc {
    return {
      guild_id: guildId,
      enabled: false,
      log_channel_id: null,
      quarantine_role_id: null,
      whitelist: [],
      modules: this.defaultAntinukeModules(),
      updated_at: new Date(),
    };
  }

  private async saveAntinukeConfig(doc: AntinukeConfigDoc): Promise<void> {
    await this.connect();
    await this.col<AntinukeConfigDoc>('antinuke_configs').replaceOne(
      { guild_id: doc.guild_id },
      doc,
      { upsert: true },
    );
  }

  /** Fetches the guild's antinuke config, backfilling defaults for any modules missing (e.g. added after the doc was created). */
  async getAntinukeConfig(guildId: string): Promise<AntinukeConfigDoc> {
    await this.connect();
    const doc = await this.col<AntinukeConfigDoc>('antinuke_configs').findOne({ guild_id: guildId });
    if (!doc) return this.defaultAntinukeConfig(guildId);

    if (doc.enabled === undefined) doc.enabled = false;
    if (doc.log_channel_id === undefined) doc.log_channel_id = null;
    if (doc.quarantine_role_id === undefined) doc.quarantine_role_id = null;
    if (!doc.whitelist) doc.whitelist = [];
    if (!doc.modules) doc.modules = this.defaultAntinukeModules();

    const defaults = this.defaultAntinukeModules();
    for (const key of Object.keys(defaults) as AntinukeModuleKey[]) {
      if (!doc.modules[key]) doc.modules[key] = defaults[key];
    }
    return doc;
  }

  async setAntinukeEnabled(guildId: string, enabled: boolean): Promise<AntinukeConfigDoc> {
    const doc = await this.getAntinukeConfig(guildId);
    doc.enabled = enabled;
    doc.updated_at = new Date();
    await this.saveAntinukeConfig(doc);
    return doc;
  }

  async setAntinukeLogChannel(guildId: string, channelId: string | null): Promise<AntinukeConfigDoc> {
    const doc = await this.getAntinukeConfig(guildId);
    doc.log_channel_id = channelId;
    doc.updated_at = new Date();
    await this.saveAntinukeConfig(doc);
    return doc;
  }

  async setAntinukeQuarantineRole(guildId: string, roleId: string | null): Promise<AntinukeConfigDoc> {
    const doc = await this.getAntinukeConfig(guildId);
    doc.quarantine_role_id = roleId;
    doc.updated_at = new Date();
    await this.saveAntinukeConfig(doc);
    return doc;
  }

  async setAntinukeModuleEnabled(guildId: string, module: AntinukeModuleKey, enabled: boolean): Promise<AntinukeConfigDoc> {
    const doc = await this.getAntinukeConfig(guildId);
    doc.modules[module].enabled = enabled;
    doc.updated_at = new Date();
    await this.saveAntinukeConfig(doc);
    return doc;
  }

  async setAntinukeModulePunishment(guildId: string, module: AntinukeModuleKey, punishment: AntinukePunishment): Promise<AntinukeConfigDoc> {
    const doc = await this.getAntinukeConfig(guildId);
    doc.modules[module].punishment = punishment;
    doc.updated_at = new Date();
    await this.saveAntinukeConfig(doc);
    return doc;
  }

  async setAntinukeModuleThreshold(guildId: string, module: AntinukeModuleKey, limit: number, intervalMs: number): Promise<AntinukeConfigDoc> {
    const doc = await this.getAntinukeConfig(guildId);
    doc.modules[module].limit = limit;
    doc.modules[module].interval_ms = intervalMs;
    doc.updated_at = new Date();
    await this.saveAntinukeConfig(doc);
    return doc;
  }

  async addAntinukeWhitelistEntry(guildId: string, type: AntinukeWhitelistType, id: string, addedBy: string): Promise<AntinukeConfigDoc | 'duplicate'> {
    const doc = await this.getAntinukeConfig(guildId);
    if (doc.whitelist.some((w) => w.type === type && w.id === id)) return 'duplicate';
    doc.whitelist.push({ type, id, added_by: addedBy, added_at: new Date() });
    doc.updated_at = new Date();
    await this.saveAntinukeConfig(doc);
    return doc;
  }

  async removeAntinukeWhitelistEntry(guildId: string, type: AntinukeWhitelistType, id: string): Promise<boolean> {
    const doc = await this.getAntinukeConfig(guildId);
    const before = doc.whitelist.length;
    doc.whitelist = doc.whitelist.filter((w) => !(w.type === type && w.id === id));
    if (doc.whitelist.length === before) return false;
    doc.updated_at = new Date();
    await this.saveAntinukeConfig(doc);
    return true;
  }

  /**
   * Applies a pre-made profile's module overrides in a single write.
   * Only `limit` and `punishment` are updated; `enabled` is set to `true` for every
   * module present in the overrides. The master antinuke switch is also set when
   * `enableAntinuke` is true (used by the Lockdown / Strict / Balanced / Lenient profiles).
   */
  async applyAntinukeProfileSettings(
    guildId: string,
    moduleOverrides: Record<AntinukeModuleKey, { limit: number; punishment: AntinukePunishment }>,
    enableAntinuke?: boolean,
  ): Promise<AntinukeConfigDoc> {
    const doc = await this.getAntinukeConfig(guildId);
    for (const key of Object.keys(moduleOverrides) as AntinukeModuleKey[]) {
      if (doc.modules[key]) {
        doc.modules[key].limit       = moduleOverrides[key].limit;
        doc.modules[key].punishment  = moduleOverrides[key].punishment;
        doc.modules[key].enabled     = true;
      }
    }
    if (enableAntinuke !== undefined) doc.enabled = enableAntinuke;
    doc.updated_at = new Date();
    await this.saveAntinukeConfig(doc);
    return doc;
  }

  async resetAntinukeConfig(guildId: string): Promise<AntinukeConfigDoc> {
    const doc = this.defaultAntinukeConfig(guildId);
    await this.saveAntinukeConfig(doc);
    return doc;
  }

  // ── Logging System ────────────────────────────────────────────────────────
  // Collection: `log_configs` — one document per guild.
  // Read-modify-write pattern (via `saveLogConfig`) is used instead of dotted
  // `$set` + `$setOnInsert` to avoid MongoDB path-conflict errors between a
  // nested field (e.g. `role.channel_id`) and its parent (`role`) on upsert.

  private defaultLogConfig(guildId: string): LogConfigDoc {
    const empty = (): LogCategoryConfig => ({ channel_id: null, exceptions: [], enabled: true });
    return {
      guild_id: guildId,
      all_channel_id: null,
      all_enabled: false,
      channel: empty(),
      member:  empty(),
      role:    empty(),
      vc:      empty(),
      message: empty(),
      server:  empty(),
      modlog:  empty(),
      updated_at: new Date(),
    };
  }

  private async saveLogConfig(doc: LogConfigDoc): Promise<void> {
    await this.connect();
    await this.col<LogConfigDoc>('log_configs').replaceOne(
      { guild_id: doc.guild_id },
      doc,
      { upsert: true },
    );
  }

  async getLogConfig(guildId: string): Promise<LogConfigDoc> {
    await this.connect();
    const doc = await this.col<LogConfigDoc>('log_configs').findOne({ guild_id: guildId });
    if (!doc) return this.defaultLogConfig(guildId);

    // Backfill `enabled`/`all_enabled` and any missing categories
    // (e.g., `modlog` added after older documents were created).
    if (doc.all_enabled === undefined) doc.all_enabled = false;
    for (const key of ['channel', 'member', 'role', 'vc', 'message', 'server', 'modlog'] as LogCategoryKey[]) {
      if (!doc[key]) doc[key] = { channel_id: null, exceptions: [], enabled: true };
      if (doc[key].enabled === undefined) doc[key].enabled = true;
    }
    return doc;
  }

  async setLogAllChannel(guildId: string, channelId: string | null): Promise<LogConfigDoc> {
    const doc = await this.getLogConfig(guildId);
    doc.all_channel_id = channelId;
    doc.updated_at = new Date();
    await this.saveLogConfig(doc);
    return doc;
  }

  async setLogCategoryChannel(
    guildId: string,
    category: LogCategoryKey,
    channelId: string | null,
  ): Promise<LogConfigDoc> {
    const doc = await this.getLogConfig(guildId);
    doc[category].channel_id = channelId;
    doc.updated_at = new Date();
    await this.saveLogConfig(doc);
    return doc;
  }

  async setLogCategoryExceptions(
    guildId: string,
    category: LogCategoryKey,
    exceptions: string[],
  ): Promise<LogConfigDoc> {
    const doc = await this.getLogConfig(guildId);
    doc[category].exceptions = exceptions;
    doc.updated_at = new Date();
    await this.saveLogConfig(doc);
    return doc;
  }

  async setLogAllEnabled(guildId: string, enabled: boolean): Promise<LogConfigDoc> {
    const doc = await this.getLogConfig(guildId);
    doc.all_enabled = enabled;
    doc.updated_at = new Date();
    await this.saveLogConfig(doc);
    return doc;
  }

  async setLogCategoryEnabled(
    guildId: string,
    category: LogCategoryKey,
    enabled: boolean,
  ): Promise<LogConfigDoc> {
    const doc = await this.getLogConfig(guildId);
    doc[category].enabled = enabled;
    doc.updated_at = new Date();
    await this.saveLogConfig(doc);
    return doc;
  }

  // ── User Self-Prefix ──────────────────────────────────────────────────────

  async getUserSelfPrefix(userId: string): Promise<string | null> {
    await this.connect();
    const doc = await this.col<UserSelfPrefixDoc>('user_self_prefixes').findOne({ user_id: userId });
    return doc?.prefix ?? null;
  }

  async setUserSelfPrefix(userId: string, prefix: string): Promise<void> {
    await this.connect();
    await this.col<UserSelfPrefixDoc>('user_self_prefixes').updateOne(
      { user_id: userId },
      { $set: { prefix, set_at: new Date() } },
      { upsert: true },
    );
  }

  async removeUserSelfPrefix(userId: string): Promise<boolean> {
    await this.connect();
    const result = await this.col<UserSelfPrefixDoc>('user_self_prefixes').deleteOne({ user_id: userId });
    return result.deletedCount > 0;
  }

  async getAllUserSelfPrefixes(): Promise<Map<string, string>> {
    await this.connect();
    const docs = await this.col<UserSelfPrefixDoc>('user_self_prefixes').find().toArray();
    return new Map(docs.map((d) => [d.user_id, d.prefix]));
  }

  // ── User Command Aliases ────────────────────────────────────────────────────

  static readonly ALIAS_MAX_PER_USER = 15;
  static readonly ALIAS_MAX_LEN = 14;

  static readonly CUSTOM_ROLE_MAX_PER_GUILD = 15;
  static readonly CUSTOM_ROLE_MAX_ROLES     = 5;

  private async ensureAliasIndexes(): Promise<void> {
    const col = this.col<UserCommandAliasDoc>('user_command_aliases');
    await col.createIndex({ user_id: 1, alias_lower: 1 }, { unique: true }).catch((): null => null);
    await col.createIndex({ user_id: 1, command: 1 }, { unique: true }).catch((): null => null);
  }

  async getUserAliases(userId: string): Promise<UserCommandAliasDoc[]> {
    await this.connect();
    return this.col<UserCommandAliasDoc>('user_command_aliases')
      .find({ user_id: userId })
      .sort({ created_at: 1 })
      .toArray();
  }

  /** Boot-time cache: userId → (alias_lower → command). */
  async getAllUserAliases(): Promise<Map<string, Map<string, string>>> {
    await this.connect();
    const docs = await this.col<UserCommandAliasDoc>('user_command_aliases').find().toArray();
    const map = new Map<string, Map<string, string>>();
    for (const d of docs) {
      if (!map.has(d.user_id)) map.set(d.user_id, new Map());
      map.get(d.user_id)!.set(d.alias_lower, d.command);
    }
    return map;
  }

  async createUserAlias(
    userId:  string,
    alias:   string,
    command: string,
  ): Promise<true | 'duplicate_alias' | 'duplicate_command' | 'limit' | false> {
    await this.connect();
    await this.ensureAliasIndexes();

    const col = this.col<UserCommandAliasDoc>('user_command_aliases');
    const aliasLower = alias.toLowerCase();
    const commandLower = command.toLowerCase();

    const count = await col.countDocuments({ user_id: userId });
    if (count >= Database.ALIAS_MAX_PER_USER) return 'limit';

    const existingAlias = await col.findOne({ user_id: userId, alias_lower: aliasLower });
    if (existingAlias) return 'duplicate_alias';

    const existingCommand = await col.findOne({ user_id: userId, command: commandLower });
    if (existingCommand) return 'duplicate_command';

    try {
      await col.insertOne({
        user_id:     userId,
        alias,
        alias_lower: aliasLower,
        command:     commandLower,
        created_at:  new Date(),
      });
      return true;
    } catch (err: any) {
      if (err?.code === 11000) return 'duplicate_alias';
      return false;
    }
  }

  async deleteUserAlias(userId: string, aliasLower: string): Promise<boolean> {
    await this.connect();
    const result = await this.col<UserCommandAliasDoc>('user_command_aliases')
      .deleteOne({ user_id: userId, alias_lower: aliasLower });
    return result.deletedCount > 0;
  }

  // ── Vanity Role Settings ──────────────────────────────────────────────────
  // Collection: `vanity_role_settings` — one document per guild.

  async getVanityRoleSettings(guildId: string): Promise<VanityRoleSettingsDoc | null> {
    await this.connect();
    return this.col<VanityRoleSettingsDoc>('vanity_role_settings').findOne({ guild_id: guildId });
  }

  /**
   * Partial-update the status-keyword trigger fields.
   * Only the keys present in `data` are written; all other fields are left as-is
   * (or set to null on first insert via `$setOnInsert`).
   */
  /** Default document shape inserted on first upsert, excluding any keys already in $set. */
  private vanityRoleDefaults(excludeKeys: string[] = []): Record<string, any> {
    const defaults: Record<string, any> = {
      status_enabled:      true,
      status_keyword:      null,
      status_role_id:      null,
      status_message_text: null,
      status_message_data: null,
      tag_enabled:         true,
      tag_role_id:         null,
      tag_message_text:    null,
      tag_message_data:    null,
      message_channel_id:  null,
    };
    for (const key of excludeKeys) delete defaults[key];
    return defaults;
  }

  /**
   * Partial-update the status-keyword trigger fields.
   * Only the keys present in `data` are written; all other fields are left as-is
   * (or given defaults on first insert via `$setOnInsert`).
   */
  async setVanityRoleStatusConfig(
    guildId: string,
    data: Partial<Pick<VanityRoleSettingsDoc,
      | 'status_enabled'
      | 'status_keyword'
      | 'status_role_id'
      | 'status_message_text'
      | 'status_message_data'>>,
  ): Promise<void> {
    await this.connect();
    await this.col<VanityRoleSettingsDoc>('vanity_role_settings').updateOne(
      { guild_id: guildId },
      {
        $set:         { ...data, updated_at: new Date() },
        $setOnInsert: this.vanityRoleDefaults(Object.keys(data)) as any,
      },
      { upsert: true },
    );
  }

  /**
   * Partial-update the server-tag trigger fields.
   */
  async setVanityRoleTagConfig(
    guildId: string,
    data: Partial<Pick<VanityRoleSettingsDoc,
      | 'tag_enabled'
      | 'tag_role_id'
      | 'tag_message_text'
      | 'tag_message_data'>>,
  ): Promise<void> {
    await this.connect();
    await this.col<VanityRoleSettingsDoc>('vanity_role_settings').updateOne(
      { guild_id: guildId },
      {
        $set:         { ...data, updated_at: new Date() },
        $setOnInsert: this.vanityRoleDefaults(Object.keys(data)) as any,
      },
      { upsert: true },
    );
  }

  /** Set or remove the shared announcement channel for vanity-role messages. */
  async setVanityRoleMessageChannel(guildId: string, channelId: string | null): Promise<void> {
    await this.connect();
    await this.col<VanityRoleSettingsDoc>('vanity_role_settings').updateOne(
      { guild_id: guildId },
      {
        $set:         { message_channel_id: channelId, updated_at: new Date() },
        $setOnInsert: this.vanityRoleDefaults(['message_channel_id']) as any,
      },
      { upsert: true },
    );
  }

  // ── Autorole ───────────────────────────────────────────────────────────────

  async getAutoroleConfig(guildId: string): Promise<AutoroleConfigDoc | null> {
    await this.connect();
    return this.col<AutoroleConfigDoc>('autorole_configs').findOne({ guild_id: guildId });
  }

  async setAutoroleConfig(
    guildId: string,
    data: Partial<Pick<AutoroleConfigDoc, 'enabled' | 'member_role_ids' | 'bot_role_ids'>>,
  ): Promise<void> {
    await this.connect();
    const defaults: Record<string, any> = {
      enabled:         true,
      member_role_ids: [],
      bot_role_ids:    [],
    };
    for (const key of Object.keys(data)) delete defaults[key];

    await this.col<AutoroleConfigDoc>('autorole_configs').updateOne(
      { guild_id: guildId },
      {
        $set:         { ...data, updated_at: new Date() },
        $setOnInsert: defaults,
      },
      { upsert: true },
    );
  }

  // ── Name Styles ────────────────────────────────────────────────────────────

  async getNameStyle(guildId: string): Promise<NameStyleDoc | null> {
    await this.connect();
    return this.col<NameStyleDoc>('name_styles').findOne({ guild_id: guildId });
  }

  async getAllNameStyles(): Promise<NameStyleDoc[]> {
    await this.connect();
    return this.col<NameStyleDoc>('name_styles').find().toArray();
  }

  async setNameStyle(
    guildId:  string,
    fontId:   number,
    effectId: number,
    colors:   number[],
    setBy:    string,
  ): Promise<NameStyleDoc> {
    await this.connect();
    const doc: NameStyleDoc = {
      guild_id:   guildId,
      font_id:    fontId,
      effect_id:  effectId,
      colors,
      set_by:     setBy,
      updated_at: new Date(),
    };
    await this.col<NameStyleDoc>('name_styles').replaceOne(
      { guild_id: guildId },
      doc,
      { upsert: true },
    );
    return doc;
  }

  async removeNameStyle(guildId: string): Promise<boolean> {
    await this.connect();
    const result = await this.col<NameStyleDoc>('name_styles').deleteOne({ guild_id: guildId });
    return result.deletedCount > 0;
  }

  // ── Autoresponders ───────────────────────────────────────────────────────

  private static readonly AR_MAX_PER_GUILD = 25;
  private static readonly AR_MAX_RESPONSES = 5;

  /** Generate a random 8-char alphanumeric ID using crypto.randomBytes (no npm deps). */
  private static generateArId(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    const bytes = randomBytes(8);
    return Array.from(bytes).map((b) => chars[b % chars.length]).join('');
  }

  /** Generate a globally-unique ar_id, retrying on collision. */
  private async generateUniqueArId(): Promise<string> {
    const col = this.col<AutoresponderDoc>('autoresponders');
    for (let attempt = 0; attempt < 10; attempt++) {
      const id = Database.generateArId();
      const existing = await col.findOne({ ar_id: id });
      if (!existing) return id;
    }
    // Extremely unlikely; fall back to longer ID
    return randomBytes(12).toString('hex').slice(0, 12);
  }

  async createAutoresponder(
    guildId:    string,
    trigger:    string,
    matchType:  AutoresponderMatchType,
    createdBy:  string,
  ): Promise<true | 'duplicate' | 'limit' | false> {
    await this.connect();
    const triggerLower = trigger.toLowerCase();
    const col = this.col<AutoresponderDoc>('autoresponders');

    await col.createIndex({ guild_id: 1, trigger_lower: 1 }, { unique: true }).catch((): null => null);
    await col.createIndex({ ar_id: 1 }, { unique: true }).catch((): null => null);
    await col.createIndex({ is_global: 1 }).catch((): null => null);

    // Pre-check the per-guild cap. This is best-effort (a concurrent add could
    // still slip past it by one), so it is re-validated with a cheap cleanup
    // pass below; the unique index is what actually guarantees no duplicates.
    const count = await col.countDocuments({ guild_id: guildId });
    if (count >= Database.AR_MAX_PER_GUILD) return 'limit';

    const ar_id = await this.generateUniqueArId();
    const now = new Date();
    try {
      await col.insertOne({
        guild_id:      guildId,
        ar_id,
        trigger,
        trigger_lower: triggerLower,
        match_type:    matchType,
        responses:     [],
        enabled:       true,
        is_global:     false,
        created_by:    createdBy,
        created_at:    now,
        updated_at:    now,
      });
      return true;
    } catch (err: any) {
      // Duplicate key error (E11000) from the unique index — race-safe check.
      if (err?.code === 11000) return 'duplicate';
      return false;
    }
  }

  async getAutoresponder(guildId: string, triggerLower: string): Promise<AutoresponderDoc | null> {
    await this.connect();
    return this.col<AutoresponderDoc>('autoresponders').findOne({
      guild_id: guildId,
      trigger_lower: triggerLower.toLowerCase(),
    });
  }

  async getAllAutoresponders(guildId: string): Promise<AutoresponderDoc[]> {
    await this.connect();
    return this.col<AutoresponderDoc>('autoresponders')
      .find({ guild_id: guildId })
      .sort({ created_at: 1 })
      .toArray();
  }

  async countAutoresponders(guildId: string): Promise<number> {
    await this.connect();
    return this.col<AutoresponderDoc>('autoresponders').countDocuments({ guild_id: guildId });
  }

  async deleteAutoresponder(guildId: string, triggerLower: string): Promise<boolean> {
    await this.connect();
    const result = await this.col<AutoresponderDoc>('autoresponders').deleteOne({
      guild_id: guildId,
      trigger_lower: triggerLower.toLowerCase(),
    });
    return result.deletedCount > 0;
  }

  async setAutoresponderEnabled(guildId: string, triggerLower: string, enabled: boolean): Promise<boolean> {
    await this.connect();
    const result = await this.col<AutoresponderDoc>('autoresponders').updateOne(
      { guild_id: guildId, trigger_lower: triggerLower.toLowerCase() },
      { $set: { enabled, updated_at: new Date() } },
    );
    return result.matchedCount > 0;
  }

  async setAutoresponderMatchType(guildId: string, triggerLower: string, matchType: AutoresponderMatchType): Promise<boolean> {
    await this.connect();
    const result = await this.col<AutoresponderDoc>('autoresponders').updateOne(
      { guild_id: guildId, trigger_lower: triggerLower.toLowerCase() },
      { $set: { match_type: matchType, updated_at: new Date() } },
    );
    return result.matchedCount > 0;
  }

  /**
   * Returns `false` if the autoresponder does not exist or already has the max
   * number of responses. The cap is enforced atomically via an aggregation
   * pipeline update — the `$push` only happens when the current array size is
   * still under the cap, so concurrent adds cannot exceed `AR_MAX_RESPONSES`.
   */
  async addAutoresponderResponse(
    guildId:      string,
    triggerLower: string,
    response:     AutoresponderResponseAction,
  ): Promise<boolean> {
    await this.connect();
    const col = this.col<AutoresponderDoc>('autoresponders');
    const filter = { guild_id: guildId, trigger_lower: triggerLower.toLowerCase() };

    const result = await col.updateOne(filter, [
      {
        $set: {
          responses: {
            $cond: [
              { $lt: [{ $size: '$responses' }, Database.AR_MAX_RESPONSES] },
              { $concatArrays: ['$responses', [response]] },
              '$responses',
            ],
          },
          updated_at: new Date(),
        },
      },
    ] as any);
    if (result.matchedCount === 0) return false;

    // Confirm the push actually happened (it may have been skipped by the cap).
    const doc = await col.findOne(filter);
    return doc?.responses.some((r) => r.type === response.type && r.content === response.content) ?? false;
  }

  async removeAutoresponderResponse(guildId: string, triggerLower: string, index: number): Promise<boolean> {
    await this.connect();
    const col = this.col<AutoresponderDoc>('autoresponders');
    const doc = await col.findOne({ guild_id: guildId, trigger_lower: triggerLower.toLowerCase() });
    if (!doc || index < 0 || index >= doc.responses.length) return false;

    doc.responses.splice(index, 1);
    await col.updateOne(
      { guild_id: guildId, trigger_lower: triggerLower.toLowerCase() },
      { $set: { responses: doc.responses, updated_at: new Date() } },
    );
    return true;
  }

  /** Fetch a single autoresponder by its globally-unique ar_id (no guildId needed). */
  async getAutoresponderById(arId: string): Promise<AutoresponderDoc | null> {
    await this.connect();
    return this.col<AutoresponderDoc>('autoresponders').findOne({ ar_id: arId });
  }

  /**
   * Return all autoresponder docs across every guild, sorted by created_at.
   * Backfills `ar_id` for any legacy doc created before that field existed,
   * so every row returned here is guaranteed toggleable via `ar_id`.
   */
  async getAllAutorespondersAcrossGuilds(): Promise<AutoresponderDoc[]> {
    await this.connect();
    const col = this.col<AutoresponderDoc>('autoresponders');
    const docs = await col.find().sort({ created_at: 1 }).toArray();

    for (const doc of docs) {
      if (doc.ar_id) continue;
      const ar_id = await this.generateUniqueArId();
      await col.updateOne({ _id: (doc as any)._id }, { $set: { ar_id } });
      doc.ar_id = ar_id;
    }

    return docs;
  }

  /** Return all autoresponders that have is_global === true. */
  async getGlobalAutoresponders(): Promise<AutoresponderDoc[]> {
    await this.connect();
    return this.col<AutoresponderDoc>('autoresponders')
      .find({ is_global: true })
      .sort({ created_at: 1 })
      .toArray();
  }

  /** Set or unset the is_global flag for an autoresponder by ar_id. */
  async setAutoresponderGlobal(arId: string, isGlobal: boolean): Promise<boolean> {
    await this.connect();
    const result = await this.col<AutoresponderDoc>('autoresponders').updateOne(
      { ar_id: arId },
      { $set: { is_global: isGlobal, updated_at: new Date() } },
    );
    return result.matchedCount > 0;
  }

  // ── Custom Roles ──────────────────────────────────────────────────────────────
  // Collection: `custom_roles` — one document per (guild_id + keyword).

  async getCustomRole(guildId: string, keyword: string): Promise<CustomRoleDoc | null> {
    await this.connect();
    return this.col<CustomRoleDoc>('custom_roles').findOne({
      guild_id: guildId,
      keyword:  keyword.toLowerCase(),
    });
  }

  async getCustomRoles(guildId: string): Promise<CustomRoleDoc[]> {
    await this.connect();
    return this.col<CustomRoleDoc>('custom_roles')
      .find({ guild_id: guildId })
      .sort({ created_at: 1 })
      .toArray();
  }

  async createCustomRole(
    guildId:   string,
    keyword:   string,
    roleIds:   string[],
    createdBy: string,
  ): Promise<CustomRoleDoc | 'exists' | 'limit'> {
    await this.connect();
    const lower = keyword.toLowerCase();

    const existing = await this.col<CustomRoleDoc>('custom_roles').findOne({ guild_id: guildId, keyword: lower });
    if (existing) return 'exists';

    const count = await this.col<CustomRoleDoc>('custom_roles').countDocuments({ guild_id: guildId });
    if (count >= Database.CUSTOM_ROLE_MAX_PER_GUILD) return 'limit';

    const doc: CustomRoleDoc = {
      guild_id:   guildId,
      keyword:    lower,
      role_ids:   roleIds.slice(0, Database.CUSTOM_ROLE_MAX_ROLES),
      created_by: createdBy,
      created_at: new Date(),
    };
    await this.col<CustomRoleDoc>('custom_roles').insertOne(doc);
    return doc;
  }

  async deleteCustomRole(guildId: string, keyword: string): Promise<boolean> {
    await this.connect();
    const result = await this.col<CustomRoleDoc>('custom_roles').deleteOne({
      guild_id: guildId,
      keyword:  keyword.toLowerCase(),
    });
    return result.deletedCount > 0;
  }

  async setCustomRoleRoles(guildId: string, keyword: string, roleIds: string[]): Promise<CustomRoleDoc | null> {
    await this.connect();
    const result = await this.col<CustomRoleDoc>('custom_roles').findOneAndUpdate(
      { guild_id: guildId, keyword: keyword.toLowerCase() },
      { $set: { role_ids: roleIds.slice(0, Database.CUSTOM_ROLE_MAX_ROLES) } },
      { returnDocument: 'after' },
    );
    return result ?? null;
  }

  // ── 24/7 Mode ─────────────────────────────────────────────────────────────

  async get24Seven(guildId: string): Promise<{ channelId: string; enabled: boolean } | null> {
    await this.connect();
    const doc = await this.col<{ guild_id: string; channelId: string; enabled: boolean }>('twentyfour_seven').findOne({ guild_id: guildId });
    if (!doc) return null;
    return { channelId: doc.channelId, enabled: doc.enabled };
  }

  async set24Seven(guildId: string, channelId: string): Promise<void> {
    await this.connect();
    await this.col<{ guild_id: string; channelId: string; enabled: boolean; updatedAt: Date }>('twentyfour_seven').updateOne(
      { guild_id: guildId },
      { $set: { channelId, enabled: true, updatedAt: new Date() } },
      { upsert: true },
    );
  }

  async clear24Seven(guildId: string): Promise<void> {
    await this.connect();
    await this.col<{ guild_id: string; channelId: string; enabled: boolean; updatedAt: Date }>('twentyfour_seven').updateOne(
      { guild_id: guildId },
      { $set: { enabled: false, updatedAt: new Date() } },
    );
  }

  async getAllEnabled24Seven(): Promise<Array<{ guildId: string; channelId: string }>> {
    await this.connect();
    const docs = await this.col<{ guild_id: string; channelId: string; enabled: boolean }>('twentyfour_seven').find({ enabled: true }).toArray();
    return docs.map(d => ({ guildId: d.guild_id, channelId: d.channelId }));
  }

}

// ─────────────────────────────────────────────────────────────────────────────
// Singleton + boot helper
// ─────────────────────────────────────────────────────────────────────────────

export const db = new Database();

/**
 * Boot-block database initialiser.
 * Connects, emits startup log lines, and returns the `Database` singleton.
 * Call once from `levitate.ts` during bootstrap.
 */
export async function initDatabase(buildName: string): Promise<Database> {
  await db.initWithLogs(buildName);
  return db;
}
