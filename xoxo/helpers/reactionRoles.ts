// xoxo/helpers/reactionRoles.ts
//
// Shared persistence and runtime helpers for reaction roles.

import type { LevitateClient } from '../structures/LevitateClient.js';
import type { ReactionRolePair } from '../database/database.js';
import { resolveEmoji } from './emojiResolver.js';
import { resolveRole } from './roleResolver.js';

export const REACTION_ROLE_MAX_MESSAGES = 5;
export const REACTION_ROLE_MAX_PAIRS = 15;

export function reactionRoleEmojiKey(value: any): string {
  if (typeof value === 'string') {
    const custom = value.match(/^<a?:[\w]+:(\d+)>$/);
    return custom ? `id:${custom[1]}` : `unicode:${value}`;
  }
  return value?.id
    ? `id:${value.id}`
    : `unicode:${value?.name ?? value ?? ''}`;
}

export function reactionRoleEmojiDisplay(value: any): string {
  if (typeof value === 'string') return value;
  return value?.id
    ? (value.animated
      ? `<a:${value.name}:${value.id}>`
      : `<:${value.name}:${value.id}>`)
    : String(value?.name ?? value ?? '');
}

export interface ReactionRolePairResult {
  pair?: ReactionRolePair;
  emoji?: any;
  error?: string;
}

export async function buildReactionRolePair(
  client: LevitateClient,
  guild: any,
  rawEmoji: string,
  rawRole: string,
  actorId: string,
  existing: ReactionRolePair[] = [],
): Promise<ReactionRolePairResult> {
  const resolvedEmoji = await resolveEmoji(client, rawEmoji, guild);
  if (!resolvedEmoji) {
    return { error: 'I could not resolve that emoji. Use a Unicode emoji, custom emoji mention, custom emoji ID, or emoji name.' };
  }

  const role = resolveRole(guild, rawRole)
    ?? await guild.roles.fetch(rawRole).catch((): null => null);
  if (!role) {
    return { error: 'I could not find that role. Use a role mention, role ID, or role name.' };
  }

  const botMember = guild.members.me ?? await guild.members.fetchMe?.().catch((): null => null);
  const invoker = guild.members.cache.get(actorId)
    ?? await guild.members.fetch(actorId).catch((): null => null);
  const invokerTop = actorId === guild.ownerId
    ? Number.POSITIVE_INFINITY
    : (invoker?.roles?.highest?.position ?? 0);

  if (
    role.id === guild.id
    || role.managed
    || !botMember?.permissions?.has?.('ManageRoles')
    || role.position >= (botMember?.roles?.highest?.position ?? 0)
    || role.position >= invokerTop
  ) {
    return { error: 'That role is managed, @everyone, or above my/your highest role. I also need Manage Roles.' };
  }

  const pair: ReactionRolePair = {
    emoji: reactionRoleEmojiDisplay(resolvedEmoji),
    emoji_key: reactionRoleEmojiKey(resolvedEmoji),
    role_id: role.id,
    role_label: role.name,
  };

  if (existing.some((item) => item.emoji_key === pair.emoji_key)) {
    return { error: 'That emoji is already linked to this message.' };
  }

  return { pair, emoji: resolvedEmoji };
}

export async function handleReactionRoleReaction(
  reaction: any,
  user: any,
  client: LevitateClient,
  adding: boolean,
): Promise<void> {
  if (!client.db || !user?.id) return;

  let current = reaction;
  if (current?.partial) {
    current = await current.fetch().catch((): null => null);
    if (!current) return;
  }
  let message = current.message;
  if (message?.partial) message = await message.fetch().catch((): any => message);

  const guild = message?.guild;
  const guildId = guild?.id ?? message?.guildId;
  if (!guild || !guildId || !message?.id) return;

  const config = await client.db.getReactionRoleMessage(guildId, message.id).catch((): null => null);
  if (!config) return;

  const pair = config.pairs.find((candidate) => candidate.emoji_key === reactionRoleEmojiKey(current.emoji));
  if (!pair) {
    // Reaction-role messages only allow their configured emojis. Remove an
    // unrecognised reaction from whoever added it, without sending a notice.
    await current.users?.remove?.(user.id).catch?.((): null => null);
    return;
  }
  if (user.bot) return;

  const role = guild.roles.cache.get(pair.role_id)
    ?? await guild.roles.fetch(pair.role_id).catch((): null => null);
  const botMember = guild.members.me ?? await guild.members.fetchMe?.().catch((): null => null);
  if (!role || role.managed || role.id === guild.id || !botMember || role.position >= botMember.roles.highest.position) return;

  const member = guild.members.cache.get(user.id)
    ?? await guild.members.fetch(user.id).catch((): null => null);
  if (!member) return;

  try {
    if (adding) {
      if (config.allow_multiple !== true) {
        for (const previousPair of config.pairs) {
          if (previousPair.emoji_key === pair.emoji_key) continue;

          const previousRole = previousPair.role_id === role.id
            ? null
            : guild.roles.cache.get(previousPair.role_id)
              ?? await guild.roles.fetch(previousPair.role_id).catch((): null => null);
          if (previousRole && member.roles.cache.has(previousRole.id)) {
            await member.roles.remove(previousRole, 'Reaction role selection changed');
          }

          const previousReaction = message.reactions.cache.find((candidate: any) =>
            candidate.emoji && reactionRoleEmojiKey(candidate.emoji) === previousPair.emoji_key,
          );
          await previousReaction?.users?.remove?.(user.id).catch?.((): null => null);
        }
      }
      if (!member.roles.cache.has(role.id)) await member.roles.add(role, 'Reaction role selected');
    } else if (member.roles.cache.has(role.id)) {
      await member.roles.remove(role, 'Reaction role removed');
    }
  } catch (error: unknown) {
    console.error(`[reactionroles] Failed to ${adding ? 'add' : 'remove'} role ${role.id} for ${user.id}: ${error instanceof Error ? error.message : String(error)}`);
  }
}