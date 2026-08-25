import {
  ContainerBuilder,
  MessageFlags,
  SeparatorBuilder,
  TextDisplayBuilder,
} from 'discord.js';
import type { CassieClient } from '../structures/CassieClient.js';
import {
  buildStarboardPost,
  wrap,
} from '../components/features/starboard.js';
import type { StarboardSettingsDoc } from '../database/database.js';

export interface ClearStarboardResult {
  recordsDeleted: number;
  messagesDeleted: number;
  messagesNotDeleted: number;
}

function emojiKey(emoji: any): string {
  return emoji?.id ? `${emoji.name ?? ''}:${emoji.id}` : (emoji?.name ?? '');
}

function configuredEmojiKey(value: string): string {
  const custom = value.match(/^<a?:([^:>]+):(\d+)>$/);
  return custom ? `${custom[1]}:${custom[2]}` : value;
}

function isConfiguredEmoji(reaction: any, settings: StarboardSettingsDoc): boolean {
  return emojiKey(reaction.emoji) === configuredEmojiKey(settings.emoji);
}

const reactionSyncLocks = new Map<string, Promise<void>>();

async function fetchReactionMessage(reaction: any): Promise<{ reaction: any; message: any } | null> {
  let resolvedReaction = reaction;
  if (resolvedReaction.partial) {
    try {
      resolvedReaction = await resolvedReaction.fetch();
    } catch {
      return null;
    }
  }

  let message = resolvedReaction.message;
  if (message?.partial) {
    try {
      message = await message.fetch();
    } catch {
      return null;
    }
  }
  if (!message?.guild || !message?.id) return null;
  return { reaction: resolvedReaction, message };
}

async function countEligibleStars(reaction: any): Promise<number | null> {
  try {
    const users = await reaction.users.fetch();
    return users.filter((user: any) => !user.bot).size;
  } catch {
    // `reaction.count` includes bot users, so using it here could publish a
    // starboard post that does not meet the configured human-star threshold.
    // Leave the existing board state alone until Discord gives us the user
    // list needed for an accurate count.
    return null;
  }
}

function attachmentUrls(message: any): string[] {
  return message.attachments
    ? [...message.attachments.values()].map((attachment: any) => attachment.url).filter(Boolean)
    : [];
}

function sourceContent(message: any): string {
  const content = String(message.content ?? '').trim();
  if (!message.reference?.messageId) return content;
  const sourceUrl = `https://discord.com/channels/${message.guild.id}/${message.channelId}/${message.reference.messageId}`;
  const replyLine = `↪ Replying to [the original message](${sourceUrl})`;
  return content ? `${replyLine}\n\n${content}` : replyLine;
}

function ignored(message: any, settings: StarboardSettingsDoc): boolean {
  const channelId = message.channelId ?? message.channel?.id;
  if (settings.ignored_channel_ids?.includes(channelId)) return true;
  const roleIds = message.member?.roles?.cache
    ? [...message.member.roles.cache.keys()]
    : [];
  return roleIds.some((roleId) => settings.ignored_role_ids?.includes(roleId));
}

async function removeBoardPost(client: CassieClient, post: any, guildId: string, count: number): Promise<void> {
  if (post?.board_message_id) {
    try {
      const boardChannel = await client.channels.fetch(post.board_channel_id) as any;
      const boardMessage = await boardChannel.messages.fetch(post.board_message_id);
      await boardMessage.delete();
    } catch {
      // The board message may already have been removed.
    }
  }
  if (post) {
    await client.db.setStarboardPostBoardMessage(
      guildId,
      post.source_message_id,
      null,
      false,
      count,
    ).catch((): null => null);
  }
}

export async function clearStarboardPosts(
  client: CassieClient,
  guildId: string,
): Promise<ClearStarboardResult> {
  const posts = await client.db.getStarboardPosts(guildId);
  let messagesDeleted = 0;
  let messagesNotDeleted = 0;

  for (const post of posts) {
    if (!post.board_message_id) continue;
    try {
      const boardChannel = await client.channels.fetch(post.board_channel_id) as any;
      const boardMessage = await boardChannel?.messages?.fetch(post.board_message_id);
      await boardMessage.delete();
      messagesDeleted++;
    } catch {
      // Missing messages are already clear. Permission/API failures are
      // reported in the result, while the database records are still removed
      // because this action explicitly clears the starboard history.
      messagesNotDeleted++;
    }
  }

  const recordsDeleted = await client.db.deleteStarboardPosts(guildId);
  return { recordsDeleted, messagesDeleted, messagesNotDeleted };
}

async function syncStarboardReactionNow(
  reaction: any,
  user: any,
  client: CassieClient,
): Promise<void> {
  if (user?.bot) return;
  const resolved = await fetchReactionMessage(reaction);
  if (!resolved) return;

  const { reaction: currentReaction, message } = resolved;
  if (message.author?.bot) return;

  const settings = await client.db.getStarboardSettings(message.guild.id).catch((error: unknown): null => {
    console.error(`[starboard] Failed to load settings for guild ${message.guild.id}: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  });
  if (!settings) return;
  if (settings.enabled === false) return;
  if (!settings.channel_id) return;
  if (!isConfiguredEmoji(currentReaction, settings)) return;
  if (ignored(message, settings)) return;

  const count = await countEligibleStars(currentReaction);
  if (count === null) return;
  const existing = await client.db.getStarboardPost(message.guild.id, message.id);
  const targetChannel = await client.channels.fetch(settings.channel_id).catch((error: unknown): null => {
    console.error(`[starboard] Failed to fetch destination ${settings.channel_id}: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }) as any;
  if (!targetChannel?.isTextBased?.()) return;

  if (count < settings.threshold) {
    if (existing?.active) await removeBoardPost(client, existing, message.guild.id, count);
    return;
  }

  const targetIsNsfw = targetChannel.nsfw === true;
  const post = await client.db.upsertStarboardPost(message.guild.id, message.id, {
    source_channel_id: message.channelId,
    board_channel_id: settings.channel_id,
    board_message_id: existing?.board_message_id ?? null,
    author_id: message.author.id,
    author_name: message.author.globalName ?? message.author.username ?? 'Unknown user',
    author_avatar: message.author.displayAvatarURL?.({ size: 256 }) ?? null,
    message_content: sourceContent(message),
    attachment_urls: attachmentUrls(message),
    source_nsfw: message.channel?.nsfw === true,
    source_message_url: message.url,
    source_created_at: new Date(message.createdTimestamp ?? Date.now()),
    star_count: count,
    active: true,
  });
  if (!post) {
    console.error(`[starboard] Failed to persist post for ${message.id}`);
    return;
  }

  const payload = buildStarboardPost(post, targetIsNsfw, settings);
  if (post.board_message_id) {
    try {
      const boardMessage = await targetChannel.messages.fetch(post.board_message_id);
      await boardMessage.edit(payload);
      return;
    } catch {
      // Recreate it below when the old board message is gone.
    }
  }

  const sent = await targetChannel.send(payload).catch((error: unknown): null => {
    console.error(`[starboard] Failed to send post for ${message.id}: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  });
  if (sent) {
    await client.db.setStarboardPostBoardMessage(
      message.guild.id,
      message.id,
      sent.id,
      true,
      count,
    );
    console.log(`[starboard] Posted ${message.id} to ${settings.channel_id} at ${count} stars`);
  }
}

export async function syncStarboardReaction(
  reaction: any,
  user: any,
  client: CassieClient,
): Promise<void> {
  // Discord can deliver several reaction events for one message in the same
  // tick. Serialize those updates per source message so two workers cannot
  // both observe "no board message" and send duplicates.
  const messageId = reaction?.message?.id;
  // Discord snowflake message IDs are globally unique, so the message ID is
  // enough even when a partial event has not exposed its guild yet.
  const lockKey = messageId ? String(messageId) : null;
  if (!lockKey) {
    await syncStarboardReactionNow(reaction, user, client);
    return;
  }

  const previous = reactionSyncLocks.get(lockKey) ?? Promise.resolve();
  const run = previous
    .catch((): void => undefined)
    .then(() => syncStarboardReactionNow(reaction, user, client));
  const tracked = run.then(
    () => {
      if (reactionSyncLocks.get(lockKey) === tracked) reactionSyncLocks.delete(lockKey);
    },
    () => {
      if (reactionSyncLocks.get(lockKey) === tracked) reactionSyncLocks.delete(lockKey);
    },
  );
  reactionSyncLocks.set(lockKey, tracked);
  await run;
}

export async function syncStarboardChannel(
  channel: any,
  client: CassieClient,
  limit = 100,
): Promise<number> {
  const messages = await channel.messages.fetch({ limit });
  let checked = 0;
  for (const message of messages.values() as Iterable<any>) {
    for (const reaction of message.reactions?.cache?.values?.() ?? []) {
      checked += 1;
      await syncStarboardReaction(reaction, null, client);
    }
  }
  return checked;
}

export async function handleStarboardSourceDelete(message: any, client: CassieClient): Promise<void> {
  if (!message.guild?.id || !message.id || !client.db) return;
  const post = await client.db.getStarboardPost(message.guild.id, message.id).catch((): null => null);
  if (!post) return;
  await removeBoardPost(client, post, message.guild.id, 0);
}

export async function buildLeaderboardPayload(client: CassieClient, guildId: string): Promise<any> {
  const [settings, posts] = await Promise.all([
    client.db.getStarboardSettings(guildId).catch((): null => null),
    client.db.getTopStarboardPosts(guildId, 10),
  ]);
  const lines = posts.length
    ? posts.map((post, index) =>
      `**${index + 1}.** ${post.star_count} ${settings?.emoji ?? '⭐'} <@${post.author_id}> in <#${post.source_channel_id}> [Jump](${post.source_message_url})`,
    ).join('\n')
    : '*No starboard history yet.*';
  return wrap(new ContainerBuilder()
    .setAccentColor(settings?.color ?? 0xFEE75C)
    .addTextDisplayComponents(new TextDisplayBuilder().setContent('## Starboard Leaderboard'))
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(lines)));
}

export async function buildRandomStarPayload(client: CassieClient, guildId: string): Promise<any> {
  const [settings, post] = await Promise.all([
    client.db.getStarboardSettings(guildId).catch((): null => null),
    client.db.getRandomStarboardPost(guildId),
  ]);
  if (!post) {
    return wrap(new ContainerBuilder()
      .addTextDisplayComponents(new TextDisplayBuilder().setContent('## Random Star\n\n*No starboard history yet.*')));
  }
  const targetChannel = settings?.channel_id
    ? await client.channels.fetch(settings.channel_id).catch((): null => null) as any
    : null;
  return buildStarboardPost(post, targetChannel?.nsfw === true, settings);
}

export async function getStarboardSettingsForReaction(
  reaction: any,
  client: CassieClient,
): Promise<StarboardSettingsDoc | null> {
  const resolved = await fetchReactionMessage(reaction);
  if (!resolved) return null;
  const settings = await client.db.getStarboardSettings(resolved.message.guild.id).catch((): null => null);
  return settings && isConfiguredEmoji(resolved.reaction, settings) ? settings : null;
}