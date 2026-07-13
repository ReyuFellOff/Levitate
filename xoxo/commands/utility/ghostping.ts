// xoxo/commands/utility/ghostping.ts
//
// Ghost-ping one or more users — sends a message that pings them, then
// immediately deletes it so the notification appears but the message is gone.
//
// Prefix:  $ghostping <@user1> [@user2] … (up to 10 users)
// Slash:   /ghostping user1:<user> [user2-user10]
//
// Checks:
//   • Invoker has Administrator
//   • Bot has ManageMessages (needed to delete the ghost ping)
//   • At least 1 user, at most 10 users
//   • No role mentions — user IDs only
//   • Cooldown: 10 seconds

import { PermissionFlagsBits } from 'discord.js';
import type { LevitateClient } from '../../structures/LevitateClient.js';
import { sendError, sendSuccess } from '../../components/statusMessages.js';

export const options = {
  name:        'ghostping',
  aliases:     ['gp', 'ghostpng'] as string[],
  description: 'Ghost-ping up to 10 users (pings and immediately deletes the message).',
  usage:       'ghostping <@user1> [@user2] … (max 10)',
  category:    'utility',
  owner:       false,
  cooldown:    10,
};

const MAX_USERS = 10;

// ─── Shared helpers ───────────────────────────────────────────────────────────

function extractUserIds(args: string[]): string[] {
  const ids: string[] = [];
  const seen = new Set<string>();

  for (const arg of args) {
    // Allow <@id> and <@!id> — but NOT <@&id> (role mentions)
    const userMention = arg.match(/^<@!?(\d{17,20})>$/)?.[1];
    // Allow bare IDs
    const rawId = /^\d{17,20}$/.test(arg) ? arg : null;
    const id = userMention ?? rawId;

    if (id && !seen.has(id)) {
      ids.push(id);
      seen.add(id);
    }
  }

  return ids;
}

function buildContent(userIds: string[]): string {
  return userIds.map((id) => `<@${id}>`).join(' ');
}

async function sendGhostPing(channel: any, userIds: string[]): Promise<void> {
  const content = buildContent(userIds);
  try {
    const msg = await channel.send({
      content,
      allowedMentions: { users: userIds },
    });
    await msg.delete().catch((): null => null);
  } catch {
    // Silently absorb send/delete failures
  }
}

// ─── Prefix execute ───────────────────────────────────────────────────────────

export async function prefixExecute(
  message: any,
  args:    string[],
  _client: LevitateClient,
): Promise<any> {
  const ctx = { message };

  if (!message.guild) {
    return sendError(ctx, 'This command can only be used in a server.');
  }

  const invokerMember = message.member;
  if (!invokerMember?.permissions?.has(PermissionFlagsBits.Administrator)) {
    return sendError(ctx, 'You need **Administrator** permission to use this command.');
  }

  const botMember = message.guild.members.me;
  if (!botMember?.permissions?.has(PermissionFlagsBits.ManageMessages)) {
    return sendError(ctx, 'I need **Manage Messages** permission to delete the ghost ping.');
  }

  if (!args.length) {
    return sendError(ctx, 'Please mention at least one user to ghost-ping.');
  }

  // Reject any role mentions explicitly
  const hasRoleMention = args.some((a) => /^<@&\d{17,20}>$/.test(a));
  if (hasRoleMention) {
    return sendError(ctx, 'Roles cannot be ghost-pinged. Only users are allowed.');
  }

  const userIds = extractUserIds(args);
  if (!userIds.length) {
    return sendError(ctx, 'No valid users found. Please @mention users or provide user IDs.');
  }

  if (userIds.length > MAX_USERS) {
    return sendError(ctx, `You can ghost-ping a maximum of **${MAX_USERS} users** at once.`);
  }

  // Delete the command message first (best-effort) so the source is hidden
  await message.delete().catch((): null => null);

  await sendGhostPing(message.channel, userIds);
}

// ─── Slash execute ────────────────────────────────────────────────────────────

export async function slashExecute(
  interaction: any,
  _client:     LevitateClient,
): Promise<any> {
  await interaction.deferReply({ ephemeral: true });

  const ctx = { interaction };

  if (!interaction.guild) {
    return sendError(ctx, 'This command can only be used in a server.');
  }

  const invokerMember = interaction.member;
  if (!invokerMember?.permissions?.has(PermissionFlagsBits.Administrator)) {
    return sendError(ctx, 'You need **Administrator** permission to use this command.');
  }

  const botMember = interaction.guild.members.me;
  if (!botMember?.permissions?.has(PermissionFlagsBits.ManageMessages)) {
    return sendError(ctx, 'I need **Manage Messages** permission to delete the ghost ping.');
  }

  // Collect up to 10 user options
  const userIds: string[] = [];
  const seen = new Set<string>();

  for (let i = 1; i <= MAX_USERS; i++) {
    const optName = i === 1 ? 'user' : `user${i}`;
    const user = interaction.options.getUser(optName, false);
    if (!user) continue;
    if (!seen.has(user.id)) {
      userIds.push(user.id);
      seen.add(user.id);
    }
  }

  if (!userIds.length) {
    return sendError(ctx, 'No valid users provided.');
  }

  await sendGhostPing(interaction.channel, userIds);

  const label = userIds.length === 1 ? '1 user' : `${userIds.length} users`;
  return sendSuccess(ctx, `Ghost-pinged ${label}.`);
}
