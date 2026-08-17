// xoxo/commands/features/impersonate.ts
//
// Impersonate a server member — creates a temporary webhook named and
// avatared after the target member, sends the provided text through it,
// then immediately deletes the webhook.
//
// Prefix:  $impersonate <@user|ID|username> <text>
//
// Checks:
//   • Invoker has Manage Messages or Administrator
//   • Bot has Manage Webhooks in the channel
//   • Target must be in the server
//   • Text is 1–2000 characters
//   • Cooldown: 6 seconds

import { PermissionFlagsBits } from 'discord.js';
import type { LevitateClient } from '../../structures/LevitateClient.js';
import { sendError } from '../../components/statusMessages.js';
import { resolveUser } from '../../helpers/userResolver.js';

export const options = {
  name:        'impersonate',
  aliases:     ['mimic'] as string[],
  description: 'Send a message as another server member using a temporary webhook.',
  usage:       'impersonate <@user|ID|username> <text>',
  category:    'features',
  owner:       false,
  cooldown:    6,
  noTyping:    true,  // command deletes itself and replies via webhook — suppress the global typing indicator
};

// ─── Prefix execute ───────────────────────────────────────────────────────────

export async function prefixExecute(
  message: any,
  args:    string[],
  client: LevitateClient,
): Promise<any> {
  const ctx = { message };

  if (!message.guild) {
    return sendError(ctx, 'This command can only be used in a server.');
  }

  // ── Permission check ────────────────────────────────────────────────────────
  const invokerPerms = message.channel.permissionsFor?.(message.member);
  const hasManageMessages = invokerPerms?.has(PermissionFlagsBits.ManageMessages);
  const hasAdmin          = invokerPerms?.has(PermissionFlagsBits.Administrator);

  if (!hasManageMessages && !hasAdmin) {
    return sendError(
      ctx,
      'You need **Manage Messages** or **Administrator** permission to use this command.',
    );
  }

  // ── Argument validation ─────────────────────────────────────────────────────
  if (args.length < 2) {
    return sendError(ctx, 'Usage: `$impersonate <@user|ID|username> <text>`');
  }

  const targetUser = await resolveUser(client, message.guild, args[0]);
  if (!targetUser) {
    return sendError(ctx, 'Please provide a valid mention, user ID, or username.');
  }

  // Build text from the remainder — supports multi-word phrases naturally
  const rawArgs = typeof message.commandRawArgs === 'string' ? message.commandRawArgs : args.join(' ');
  // Strip the first whitespace-delimited token (the user arg) to get the text
  const textPart = rawArgs.replace(/^\S+\s*/, '').trim();

  if (!textPart) {
    return sendError(ctx, 'Please provide the text you want to send.');
  }

  if (textPart.length > 2000) {
    return sendError(ctx, 'The text must be 2000 characters or fewer.');
  }

  // ── Bot permission check ────────────────────────────────────────────────────
  const botMember = message.guild.members.me;
  const botChannelPerms = message.channel.permissionsFor?.(botMember);
  if (!botChannelPerms?.has(PermissionFlagsBits.ManageWebhooks)) {
    return sendError(
      ctx,
      'I need **Manage Webhooks** permission in this channel to use this command.',
    );
  }

  // ── Fetch target member ─────────────────────────────────────────────────────
  let member: any;
  try {
    member = await message.guild.members.fetch(targetUser.id);
  } catch {
    return sendError(ctx, 'I couldn\'t find that member in this server.');
  }

  // ── Resolve display name and server avatar ──────────────────────────────────
  // displayName = server nickname → global display name → username
  const displayName = member.displayName;

  // Prefer the member's server-specific avatar; fall back to their global avatar
  const avatarUrl =
    member.avatarURL({ size: 256, extension: 'png' }) ??
    member.user.displayAvatarURL({ size: 256, extension: 'png' });

  // ── Create webhook, send, delete ────────────────────────────────────────────
  let webhook: any;
  try {
    webhook = await message.channel.createWebhook({
      name:   displayName,
      avatar: avatarUrl,
      reason: `$impersonate by ${message.author.username} (${message.author.id})`,
    });
  } catch {
    return sendError(ctx, 'Failed to create the webhook. Make sure I have **Manage Webhooks** here.');
  }

  try {
    await webhook.send({
      content:          textPart,
      allowedMentions:  { parse: [] }, // no pings from impersonation messages
    });
  } catch {
    await webhook.delete().catch((): null => null);
    return sendError(ctx, 'The webhook was created but sending the message failed.');
  }

  // Delete the webhook immediately — leave no trace
  await webhook.delete().catch((): null => null);

  // Delete the invoker's command message so only the impersonation appears
  await message.delete().catch((): null => null);
}
