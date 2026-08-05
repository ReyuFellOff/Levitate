// xoxo/events/discord/messageReactionRemove.ts
//
// Fires when a user removes a reaction from a message.
// Stores the last removed reaction per channel for $reactionsnipe.
// Requires GatewayIntentBits.GuildMessageReactions + Partials.Reaction.

import type { LevitateClient } from '../../structures/LevitateClient.js';
import { pushReactionSnipe }   from '../../components/moderation/snipeStore.js';
import { syncStarboardReaction } from '../../helpers/starboard.js';

export const name = 'messageReactionRemove';
export const once = false;

export async function execute(reaction: any, user: any, client?: LevitateClient): Promise<void> {
  // Skip bots. The shared Starboard path fetches partial reactions/messages.
  if (user?.bot) return;

  const candidates = [client, reaction?.client, reaction?.message?.client];
  const runtimeClient = candidates.find((candidate: any) =>
    candidate?.db && typeof candidate.db.getStarboardSettings === 'function',
  ) as LevitateClient | undefined;
  if (!runtimeClient) {
    console.error(`[starboard] Reaction remove had no database client reference (injectedDb=${Boolean((client as any)?.db)} reactionDb=${Boolean(reaction?.client?.db)} messageDb=${Boolean(reaction?.message?.client?.db)})`);
    return;
  }
  await syncStarboardReaction(reaction, user, runtimeClient).catch((error: unknown) => {
    console.error(`[starboard] Failed to sync reaction remove: ${error instanceof Error ? error.message : String(error)}`);
  });

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
