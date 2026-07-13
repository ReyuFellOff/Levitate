// xoxo/components/moderation/snipeStore.ts
//
// In-memory snipe cache — no database required.
// Stores the last MAX_SNIPES deleted messages per channel, and
// the last removed reaction per channel.
//
// Both caches are ephemeral: they reset on bot restart.

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface SnipedMessage {
  /** Discord user ID of the author */
  authorId:     string;
  /** Display name (globalName ?? username) */
  authorName:   string;
  /** Avatar URL, null if unavailable */
  authorAvatar: string | null;
  /** Plain text content of the deleted message */
  content:      string;
  /** Direct URLs of any attachments */
  attachments:  string[];
  /** Number of embeds the message had */
  embedCount:   number;
  /** Sticker name if one was attached */
  sticker:      string | null;
  /** ID of the message being replied to, if any */
  replyTo:      string | null;
  /** Unix ms — when the message was originally sent */
  createdAt:    number;
  /** Unix ms — when it was deleted */
  deletedAt:    number;
  channelId:    string;
  guildId:      string;
}

export interface SnipedReaction {
  /** Formatted emoji string — <:name:id>, <a:name:id>, or the unicode char */
  emoji:          string;
  /** Custom emoji ID, null for unicode */
  emojiId:        string | null;
  /** Whether the emoji is animated */
  emojiAnimated:  boolean;
  /** User who removed the reaction */
  userId:         string;
  userName:       string;
  userAvatar:     string | null;
  /** Message the reaction was on */
  messageId:      string;
  /** Partial content of the original message (may be empty for uncached) */
  messageContent: string;
  /** Author of the message the reaction was removed from */
  messageAuthorId: string | null;
  channelId:      string;
  guildId:        string;
  /** Unix ms — when the reaction was removed */
  removedAt:      number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Deleted message cache
// ─────────────────────────────────────────────────────────────────────────────

const MAX_SNIPES = 5;

/** channelId → newest-first list of deleted messages */
const snipeCache = new Map<string, SnipedMessage[]>();

export function pushSnipe(channelId: string, msg: SnipedMessage): void {
  const arr = snipeCache.get(channelId) ?? [];
  arr.unshift(msg);
  if (arr.length > MAX_SNIPES) arr.length = MAX_SNIPES;
  snipeCache.set(channelId, arr);
}

/** Returns newest-first list, empty array if nothing cached. */
export function getSnipes(channelId: string): SnipedMessage[] {
  return snipeCache.get(channelId) ?? [];
}

// ─────────────────────────────────────────────────────────────────────────────
// Removed reaction cache
// ─────────────────────────────────────────────────────────────────────────────

/** channelId → most recent removed reaction */
const reactionSnipeCache = new Map<string, SnipedReaction>();

export function pushReactionSnipe(channelId: string, snipe: SnipedReaction): void {
  reactionSnipeCache.set(channelId, snipe);
}

export function getReactionSnipe(channelId: string): SnipedReaction | undefined {
  return reactionSnipeCache.get(channelId);
}
