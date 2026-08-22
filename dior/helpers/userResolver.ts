// xoxo/helpers/userResolver.ts
//
// Resolve a Discord User from a raw argument string.
// Accepted formats (in order of precedence):
//   1. User mention        <@123456789>  or  <@!123456789>
//   2. Numeric snowflake ID               123456789012345678
//   3. Username#discriminator tag         BotName#0000  (bot tags / legacy tags)
//   4. Username / display name            (searches guild members)
//
// Returns the discord.js User object, or null if nothing was found.

import type { LevitateClient } from '../structures/LevitateClient.js';

export async function resolveUser(
  client: LevitateClient,
  guild: any,
  arg: string,
): Promise<any | null> {
  const trimmed = arg.trim();
  if (!trimmed) return null;

  // 1. Mention
  const mentionMatch = trimmed.match(/^<@!?(\d+)>$/);
  if (mentionMatch) {
    return client.users.fetch(mentionMatch[1]).catch((): null => null);
  }

  // 2. Snowflake ID (17-20 digits)
  if (/^\d{17,20}$/.test(trimmed)) {
    return client.users.fetch(trimmed).catch((): null => null);
  }

  // 3. Username#discriminator tag (e.g. BotName#0000 — standard bot tag format)
  const tagMatch = trimmed.match(/^(.+)#(\d{4})$/);
  if (tagMatch) {
    const [, tagName, discriminator] = tagMatch;
    const lowerTagName = tagName.toLowerCase();

    if (guild) {
      const members = await guild.members
        .fetch({ query: tagName, limit: 25 })
        .catch(() => new Map());

      for (const [, m] of members) {
        if (
          m.user.username.toLowerCase() === lowerTagName &&
          m.user.discriminator === discriminator
        ) {
          return m.user;
        }
      }
    }

    // Fallback: scan the client's user cache (covers bots the client has seen)
    for (const user of client.users.cache.values()) {
      if (
        user.username.toLowerCase() === lowerTagName &&
        (user as any).discriminator === discriminator
      ) {
        return user;
      }
    }
  }

  // 4. Username / display name — search guild members
  if (guild) {
    const lowerArg = trimmed.toLowerCase();
    const members = await guild.members
      .fetch({ query: trimmed, limit: 10 })
      .catch(() => new Map());

    const usernameMatches = [...members.values()].filter(
      (m: any) => m.user.username.toLowerCase() === lowerArg,
    );
    if (usernameMatches.length === 1) return usernameMatches[0].user;
    if (usernameMatches.length > 1) return null;

    const displayNameMatches = [...members.values()].filter(
      (m: any) => m.displayName?.toLowerCase() === lowerArg,
    );
    if (displayNameMatches.length === 1) return displayNameMatches[0].user;
  }

  return null;
}
