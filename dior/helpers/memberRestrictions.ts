// Persistent, member-targeted moderation restrictions.
//
// Permission overwrites alone are not sufficient for these features: they
// miss newly-created channels, uncached threads, and links that bypass
// attachment permissions. The database record is the source of truth and the
// message/reaction events enforce it at the point of use.

import type { CassieClient } from '../structures/CassieClient.js';

export type RestrictionKind = 'image' | 'reaction';

function getDb(client: any): any | null {
  return client?.db && typeof client.db.getMemberRestrictions === 'function'
    ? client.db
    : null;
}

export async function getMemberRestrictions(
  client: CassieClient,
  guildId: string,
  userId: string,
): Promise<any | null> {
  const db = getDb(client);
  if (!db) return null;
  try {
    return await db.getMemberRestrictions(guildId, userId);
  } catch (error: unknown) {
    console.error(`[moderation] Failed to read member restrictions: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

export async function setMemberRestriction(
  client: CassieClient,
  guildId: string,
  userId: string,
  kind: RestrictionKind,
  enabled: boolean,
  reason: string,
  moderatorId: string,
): Promise<boolean> {
  const db = getDb(client);
  if (!db) return false;
  try {
    return await db.setMemberRestriction(guildId, userId, kind, enabled, reason, moderatorId);
  } catch (error: unknown) {
    console.error(`[moderation] Failed to save ${kind} restriction: ${error instanceof Error ? error.message : String(error)}`);
    return false;
  }
}

export async function syncReactionOverwrite(
  guild: any,
  targetMember: any,
  botMember: any,
  enabled: boolean,
): Promise<{ updated: number; skipped: number }> {
  const channels = [...(guild.channels?.cache?.values?.() ?? [])].filter((channel: any) =>
    channel.isTextBased?.() &&
    !channel.isThread?.() &&
    Boolean(channel.permissionOverwrites?.edit),
  );

  let updated = 0;
  let skipped = 0;
  await Promise.all(channels.map(async (channel: any) => {
    const botPermissions = channel.permissionsFor?.(botMember);
    if (!botPermissions?.has?.('ManageRoles')) {
      skipped++;
      return;
    }

    try {
      if (enabled) {
        await channel.permissionOverwrites.edit(
          targetMember,
          { AddReactions: false },
          { reason: 'Member reaction restriction' },
        );
      } else {
        const existing = channel.permissionOverwrites.cache.get(targetMember.id);
        if (existing) {
          await existing.edit(
            { AddReactions: null },
            { reason: 'Member reaction restriction removed' },
          );
        }
      }
      updated++;
    } catch {
      skipped++;
    }
  }));

  return { updated, skipped };
}

export async function syncReactionRestrictionForChannel(
  channel: any,
  client: CassieClient,
): Promise<void> {
  const guild = channel?.guild;
  if (!guild || channel.isThread?.() || !channel.permissionOverwrites?.edit) return;
  const db = getDb(client);
  if (!db) return;

  const restrictions = await db.getAllMemberRestrictions(guild.id).catch((): any[] => []);
  const botMember = guild.members?.me ?? await guild.members?.fetchMe?.().catch((): null => null);
  if (!botMember) return;

  for (const restriction of restrictions) {
    if (!restriction.reaction_muted) continue;
    const permissions = channel.permissionsFor?.(botMember);
    if (!permissions?.has?.('ManageRoles')) continue;
    await channel.permissionOverwrites.edit(
      restriction.user_id,
      { AddReactions: false },
      { reason: 'Restoring member reaction restriction' },
    ).catch((): null => null);
  }
}

export function isImageMessage(message: any): boolean {
  const attachments = [...(message?.attachments?.values?.() ?? [])];
  if (attachments.some((attachment: any) =>
    attachment.contentType?.startsWith?.('image/') ||
    /\.(?:png|jpe?g|gif|webp|bmp|avif|svg)(?:[?#].*)?$/i.test(attachment.url ?? attachment.name ?? ''),
  )) return true;

  if (message?.stickers?.size) return true;

  const embeds = message?.embeds ?? [];
  if (embeds.some((embed: any) =>
    Boolean(embed.image?.url || embed.thumbnail?.url) ||
    embed.type === 'image',
  )) return true;

  // Covers direct image URLs that Discord has not unfurled yet and media
  // components whose URL is not represented in message.embeds.
  const content = String(message?.content ?? '');
  if (/(?:https?:\/\/|www\.)[^\s<>()]+?\.(?:png|jpe?g|gif|webp|bmp|avif|svg)(?:[?#][^\s<>()]*)?/i.test(content)) {
    return true;
  }

  const serializedComponents = JSON.stringify(message?.components ?? []);
  return /"(?:url|media|src)"\s*:\s*"https?:\/\/[^"]+\.(?:png|jpe?g|gif|webp|bmp|avif|svg)(?:[?#][^"]*)?"/i
    .test(serializedComponents);
}

export async function enforceImageRestriction(
  message: any,
  client: CassieClient,
): Promise<boolean> {
  if (!message?.guild || message.author?.bot || !isImageMessage(message)) return false;
  const restriction = await getMemberRestrictions(client, message.guild.id, message.author.id);
  if (!restriction?.image_muted) return false;

  const deleted = await message.delete('Image-muted member attempted to send image content.')
    .then(() => true)
    .catch((error: unknown) => {
      console.error(`[moderation] Could not delete image-muted message ${message.id}: ${error instanceof Error ? error.message : String(error)}`);
      return false;
    });

  const notice = await message.channel?.send({
    content: `<@${message.author.id}>, you are muted from sending images in this server.`,
    allowedMentions: { users: [message.author.id] },
  }).catch((): null => null);
  if (notice) {
    setTimeout(() => {
      notice.delete().catch((): null => null);
    }, 5_000);
  }

  return deleted || Boolean(notice);
}

export async function enforceReactionRestriction(
  reaction: any,
  user: any,
  client: CassieClient,
): Promise<boolean> {
  if (user?.bot) return false;

  let currentReaction = reaction;
  if (currentReaction?.partial) {
    try { currentReaction = await currentReaction.fetch(); } catch { return false; }
  }
  let message = currentReaction?.message;
  if (message?.partial) {
    try { message = await message.fetch(); } catch { return false; }
  }

  const guildId = message?.guild?.id ?? message?.guildId;
  if (!guildId || !user?.id) return false;
  const restriction = await getMemberRestrictions(client, guildId, user.id);
  if (!restriction?.reaction_muted) return false;

  try {
    await currentReaction.users.remove(user.id);
    return true;
  } catch (error: unknown) {
    console.error(`[moderation] Could not remove reaction from reaction-muted user ${user.id}: ${error instanceof Error ? error.message : String(error)}`);
    return false;
  }
}

export async function validateRestrictionTarget(opts: {
  guild: any;
  targetUser: any;
  invokerId: string;
  invokerMember: any;
  botMember: any;
  developers: [string, string][];
}): Promise<{ member: any } | { error: string }> {
  const { guild, targetUser, invokerId, invokerMember, botMember, developers } = opts;
  if (targetUser.id === invokerId) return { error: 'You cannot restrict yourself.' };
  if (targetUser.id === guild.ownerId) return { error: 'You cannot restrict the server owner.' };
  if (targetUser.id === botMember?.user?.id) return { error: 'I cannot restrict myself.' };
  if (targetUser.bot) return { error: 'These restrictions can only be applied to human members.' };
  if (developers.some(([, id]) => id === targetUser.id)) {
    return { error: 'You cannot restrict a bot developer.' };
  }

  const member = await guild.members.fetch(targetUser.id).catch((): null => null);
  if (!member) return { error: `**${targetUser.username}** is not in this server.` };

  const invokerTop = invokerId === guild.ownerId
    ? Number.POSITIVE_INFINITY
    : (invokerMember?.roles?.highest?.position ?? 0);
  const targetTop = member.roles?.highest?.position ?? 0;
  if (targetTop >= invokerTop) {
    return { error: `You cannot restrict **${targetUser.username}** — they have an equal or higher role than you.` };
  }
  const botTop = botMember?.roles?.highest?.position ?? 0;
  if (targetTop >= botTop) {
    return { error: `I cannot restrict **${targetUser.username}** — their role is equal to or higher than mine.` };
  }
  return { member };
}

export function restrictionLabel(kind: RestrictionKind): string {
  return kind === 'image' ? 'image' : 'reaction';
}