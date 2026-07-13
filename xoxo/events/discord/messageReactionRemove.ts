// xoxo/events/discord/messageReactionRemove.ts
//
// Fires when a user removes a reaction from a message.
// Stores the last removed reaction per channel for $reactionsnipe.
// Requires GatewayIntentBits.GuildMessageReactions + Partials.Reaction.

import type { LevitateClient } from '../../structures/LevitateClient.js';
import { pushReactionSnipe }   from '../../components/moderation/snipeStore.js';

export const name = 'messageReactionRemove';
export const once = false;

export async function execute(reaction: any, user: any, _client: LevitateClient): Promise<void> {
  // Skip DMs and bots
  if (!reaction.message?.guild) return;
  if (user?.bot) return;

  // Fetch partial reaction / message if needed
  let r = reaction;
  if (r.partial) {
    try { r = await r.fetch(); } catch { return; }
  }

  let msg = r.message;
  if (msg.partial) {
    try { msg = await msg.fetch(); } catch { /* proceed with partial data */ }
  }

  let u = user;
  if (u.partial) {
    try { u = await u.fetch(); } catch { /* proceed with partial data */ }
  }

  const emoji     = r.emoji;
  const channelId = msg.channelId ?? msg.channel?.id;
  const guildId   = msg.guild?.id ?? msg.guildId;
  if (!channelId || !guildId) return;

  // Format emoji string
  let emojiStr: string;
  if (emoji.id) {
    emojiStr = emoji.animated
      ? `<a:${emoji.name}:${emoji.id}>`
      : `<:${emoji.name}:${emoji.id}>`;
  } else {
    emojiStr = emoji.name ?? '❓';
  }

  pushReactionSnipe(channelId, {
    emoji:           emojiStr,
    emojiId:         emoji.id   ?? null,
    emojiAnimated:   emoji.animated ?? false,
    userId:          u.id,
    userName:        u.globalName ?? u.username ?? 'Unknown',
    userAvatar:      u.displayAvatarURL?.({ size: 256 }) ?? null,
    messageId:       msg.id,
    messageContent:  (msg.content ?? '').slice(0, 200),
    messageAuthorId: msg.author?.id ?? null,
    channelId,
    guildId,
    removedAt:       Date.now(),
  });
}
