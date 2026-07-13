// xoxo/commands/autoresponder/autoresponder.ts
//
// Configure automatic reactions/replies triggered by specific words.
//
// Prefix: $autoresponder                          — interactive home panel (paged)
//         $autoresponder add <trigger>             — create a new trigger, opens manage panel
//         $autoresponder edit <trigger>            — open the manage panel for an existing trigger
//         $autoresponder remove <trigger>          — delete a trigger
//         $autoresponder toggle <trigger>          — enable/disable a trigger
//         $autoresponder info <trigger>            — view a trigger's details
//         $autoresponder list                      — paginated list of every trigger
//         $autoresponder help                      — command reference (same as home)

import type { LevitateClient } from '../../structures/LevitateClient.js';
import { PermissionFlagsBits } from 'discord.js';
import { sendError, sendSuccess, sendInfo } from '../../components/statusMessages.js';
import {
  buildAutoresponderListPayload,
  buildAutoresponderInfoPayload,
  runAutoresponderManagePanel,
  runAutoresponderHomePanel,
} from '../../components/utility/autoresponder.js';

const MAX_PER_GUILD = 25;
const MAX_TRIGGER_LEN = 100;

export const options = {
  name: 'autoresponder',
  aliases: ['ares', 'autoresponders'] as string[],
  description: 'Automatically react or reply when specific words are said.',
  usage: 'autoresponder [add|edit|remove|toggle|info|list|help] <trigger>',
  category: 'autoresponder',
  owner: false,
  cooldown: 3,
};

export async function prefixExecute(message: any, args: string[], client: LevitateClient): Promise<any> {
  const ctx = { message };
  if (!message.guild) return sendError(ctx, 'This command can only be used in a server.');

  if (!message.member?.permissions?.has?.(PermissionFlagsBits.ManageGuild))
    return sendError(ctx, 'You need the **Manage Server** permission to configure autoresponders.');

  if (!client.db) return sendError(ctx, 'Database is unavailable right now.');

  const guild = message.guild;
  const prefix = client.config.prefix;
  const sub = args[0]?.toLowerCase();

  // ── Home panel (no args) — fully interactive paged panel ────────────────────
  if (!sub || sub === 'help') {
    return runAutoresponderHomePanel(message, client, guild.id);
  }

  // ── List ─────────────────────────────────────────────────────────────────────
  if (sub === 'list') {
    const docs = await client.db.getAllAutoresponders(guild.id);
    const page = Math.max(0, (parseInt(args[1], 10) || 1) - 1);
    return message.channel.send(buildAutoresponderListPayload(docs, page, prefix));
  }

  // ── Add ──────────────────────────────────────────────────────────────────────
  if (sub === 'add') {
    const trigger = args.slice(1).join(' ').trim();
    if (!trigger) return sendError(ctx, `**Usage:** \`${prefix}autoresponder add <trigger>\``);
    if (trigger.length > MAX_TRIGGER_LEN) return sendError(ctx, `Trigger must be **${MAX_TRIGGER_LEN}** characters or fewer.`);

    const result = await client.db.createAutoresponder(guild.id, trigger, 'anywhere', message.author.id);
    if (result === 'duplicate') return sendError(ctx, `A trigger for \`${trigger}\` already exists. Use \`${prefix}autoresponder edit ${trigger}\` to manage it.`);
    if (result === 'limit') return sendError(ctx, `This server already has the maximum of **${MAX_PER_GUILD}** triggers.`);
    if (!result) return sendError(ctx, 'Failed to create the trigger. Try again.');

    return runAutoresponderManagePanel(message, client, guild.id, trigger.toLowerCase());
  }

  // ── Edit (opens the interactive manage panel) ───────────────────────────────
  if (sub === 'edit' || sub === 'manage' || sub === 'config') {
    const trigger = args.slice(1).join(' ').trim();
    if (!trigger) return sendError(ctx, `**Usage:** \`${prefix}autoresponder edit <trigger>\``);

    const doc = await client.db.getAutoresponder(guild.id, trigger.toLowerCase());
    if (!doc) return sendError(ctx, `No trigger found for \`${trigger}\`. Run \`${prefix}autoresponder list\` to see all triggers.`);

    return runAutoresponderManagePanel(message, client, guild.id, doc.trigger_lower);
  }

  // ── Info ─────────────────────────────────────────────────────────────────────
  if (sub === 'info') {
    const trigger = args.slice(1).join(' ').trim();
    if (!trigger) return sendError(ctx, `**Usage:** \`${prefix}autoresponder info <trigger>\``);

    const doc = await client.db.getAutoresponder(guild.id, trigger.toLowerCase());
    if (!doc) return sendError(ctx, `No trigger found for \`${trigger}\`.`);

    return message.channel.send(buildAutoresponderInfoPayload(doc, prefix));
  }

  // ── Remove ───────────────────────────────────────────────────────────────────
  if (sub === 'remove' || sub === 'delete') {
    const trigger = args.slice(1).join(' ').trim();
    if (!trigger) return sendError(ctx, `**Usage:** \`${prefix}autoresponder remove <trigger>\``);

    const removed = await client.db.deleteAutoresponder(guild.id, trigger.toLowerCase());
    if (!removed) return sendError(ctx, `No trigger found for \`${trigger}\`.`);

    return sendSuccess(ctx, `Deleted the \`${trigger}\` trigger.`);
  }

  // ── Toggle ───────────────────────────────────────────────────────────────────
  if (sub === 'toggle' || sub === 'enable' || sub === 'disable') {
    const trigger = args.slice(1).join(' ').trim();
    if (!trigger) return sendError(ctx, `**Usage:** \`${prefix}autoresponder toggle <trigger>\``);

    const doc = await client.db.getAutoresponder(guild.id, trigger.toLowerCase());
    if (!doc) return sendError(ctx, `No trigger found for \`${trigger}\`.`);

    const newState = sub === 'enable' ? true : sub === 'disable' ? false : !doc.enabled;
    await client.db.setAutoresponderEnabled(guild.id, doc.trigger_lower, newState);
    return sendSuccess(ctx, `\`${doc.trigger}\` is now **${newState ? 'enabled' : 'disabled'}**.`);
  }

  return sendError(ctx, `Unknown subcommand \`${sub}\`. Run \`${prefix}autoresponder help\` for the full command list.`);
}
