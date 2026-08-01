// xoxo/commands/moderation/massnick.ts
//
// Change the server nickname of every member at once.
//
// Modes:
//   massnick prepend <word>   — "word CurrentNick"
//   massnick prefix  <word>   — alias for prepend
//   massnick append  <word>   — "CurrentNick word"
//   massnick suffix  <word>   — alias for append
//   massnick remove  <word>   — remove all occurrences of <word> from each nick
//   massnick reset            — remove all server nicknames
//
// After providing the mode and word, an interactive panel with four buttons
// lets the invoker choose who is affected:
//   • All Members — every member regardless of type
//   • Humans Only — excludes bots
//   • Bots Only   — only bot accounts
//   • Cancel
//
// prepend/append/remove work on the member's effective displayed name:
//   — their server nickname if one is set
//   — otherwise their globalName / username
// Nicknames are capped at 32 characters (Discord limit).
//
// Requires ManageNicknames (+ ManageGuild recommended so regular mods can't abuse it).

import { PermissionFlagsBits, MessageFlags } from 'discord.js';
import type { LevitateClient } from '../../structures/LevitateClient.js';
import { sendError, sendLoading, sendSuccess } from '../../components/statusMessages.js';
import {
  buildMassNickTargetPanel,
  buildMassNickProgressPayload,
  buildMassNickResultPayload,
  buildMassNickTimedOutPayload,
  buildMassNickCancelledPayload,
  type MassNickTargetType,
  type MassNickMode,
} from '../../components/moderation/massnick.js';

export const options = {
  name:        'massnick',
  aliases:     ['massnickname', 'mn'] as string[],
  description: 'Change the nickname of every member at once (prepend, append, remove, or reset).',
  usage: `massnick prepend <word>
massnick prefix  <word>
massnick append  <word>
massnick suffix  <word>
massnick remove  <word>
massnick reset`,
  category: 'moderation',
  owner:    false,
  cooldown: 10,
};

const MAX_NICK = 32;

const MODES = ['prepend', 'prefix', 'append', 'suffix', 'remove', 'reset'] as const;

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Get the effective base name for a member — server nickname if set,
 * otherwise globalName/username. This is what prepend/append/remove operate on.
 */
function effectiveName(member: any): string {
  return member.nickname ?? member.user.globalName ?? member.user.username;
}

// ─────────────────────────────────────────────────────────────────────────────
// Core mass-nickname logic
// ─────────────────────────────────────────────────────────────────────────────

async function runMassNick(
  panel:      any,
  guild:      any,
  mode:       MassNickMode,
  word:       string | null,
  targetType: MassNickTargetType,
  invoker:    string,
  client:     LevitateClient,
): Promise<void> {
  await panel.edit(buildMassNickProgressPayload(mode, word, targetType)).catch((): null => null);

  let members: Map<string, any>;
  let usingCache = false;
  try {
    members = await guild.members.fetch();
  } catch {
    members = guild.members.cache;
    usingCache = true;
  }

  let changed = 0;
  let failed  = 0;
  let skipped = 0;

  const auditReason = `massnick ${mode}${word ? ` "${word}"` : ''} (${targetType}) by ${invoker}`;
  const selfId      = client.user?.id;

  // Build remove regex once (case-insensitive)
  const removeRegex = (mode === 'remove' && word)
    ? new RegExp(escapeRegex(word), 'gi')
    : null;

  for (const [, member] of members) {
    // ── Target type filter — silently ignore members outside the target group.
    // Do NOT count them as skipped; skipped is reserved for members in the
    // target group that already had the correct nickname.
    if (targetType === 'humans' && member.user.bot) continue;
    if (targetType === 'bots'   && !member.user.bot) continue;

    // ── Manageability check ─────────────────────────────────────────────────
    const isSelf = selfId && member.user.id === selfId;
    if (!isSelf && !member.manageable) { failed++; continue; }

    // ── Compute new nickname ────────────────────────────────────────────────
    let newNick: string | null;

    if (mode === 'reset') {
      if (member.nickname === null) { skipped++; continue; }
      newNick = null;
    } else if (mode === 'remove') {
      const base = effectiveName(member);
      const stripped = base.replace(removeRegex!, '').replace(/\s+/g, ' ').trim();
      if (stripped === base) { skipped++; continue; } // word not present
      // If stripping the word restores the original username/globalName, clear the nick instead
      const globalBase = member.user.globalName ?? member.user.username;
      newNick = stripped === globalBase ? null : stripped.slice(0, MAX_NICK) || null;
    } else if (mode === 'prepend' || mode === 'prefix') {
      const base = effectiveName(member);
      newNick = `${word} ${base}`.slice(0, MAX_NICK);
    } else {
      // append / suffix
      const base = effectiveName(member);
      newNick = `${base} ${word}`.slice(0, MAX_NICK);
    }

    // Skip if already at the target nick
    if (newNick !== null && newNick === member.nickname) { skipped++; continue; }

    const ok = await member
      .setNickname(newNick, auditReason)
      .then(() => true)
      .catch(() => false);

    if (ok) changed++;
    else    failed++;
  }

  await panel
    .edit(buildMassNickResultPayload(mode, word, targetType, changed, skipped, failed, usingCache))
    .catch((): null => null);
}

// ─────────────────────────────────────────────────────────────────────────────
// Prefix execute
// ─────────────────────────────────────────────────────────────────────────────

export async function prefixExecute(
  message: any,
  args:    string[],
  client:  LevitateClient,
): Promise<any> {
  const ctx   = { message };
  const guild = message.guild;
  if (!guild) return sendError(ctx, 'This command can only be used in a server.');

  const invokerPerms = message.channel.permissionsFor?.(message.member);
  if (!invokerPerms?.has?.(PermissionFlagsBits.ManageNicknames)) {
    return sendError(ctx, 'You need the **Manage Nicknames** permission to use this command.');
  }
  if (!guild.members.me?.permissions?.has?.(PermissionFlagsBits.ManageNicknames)) {
    return sendError(ctx, 'I need the **Manage Nicknames** permission to change nicknames.');
  }

  const mode = args[0]?.toLowerCase() as MassNickMode | undefined;
  if (!mode || !(MODES as readonly string[]).includes(mode)) {
    return sendError(ctx, `Usage:\n\`\`\`\n${options.usage}\n\`\`\``);
  }

  const isReset = mode === 'reset';
  let word: string | null = null;
  if (!isReset) {
    word = args[1] ?? null;
    if (!word) {
      const verb = mode === 'remove' ? 'remove' : mode === 'prepend' || mode === 'prefix' ? 'prepend' : 'append';
      return sendError(ctx, `Provide a single word to ${verb}. Example: \`massnick ${mode} HLW\``);
    }
    if (/\s/.test(word)) {
      return sendError(ctx, 'The word must contain no spaces. Use a single token.');
    }
  }

  // Generate the token here so the panel and the collector share the same one.
  const token = `${message.id}-${Date.now()}`;
  const panel = await message.channel
    .send(buildMassNickTargetPanel(mode, word, guild.memberCount, token))
    .catch((): null => null);
  if (!panel) return;

  const collector = panel.createMessageComponentCollector({
    filter: (i: any) => {
      if (!i.customId.startsWith('massnick:') || !i.customId.endsWith(`:${token}`)) return false;
      if (i.user.id !== message.author.id) {
        i.reply({ content: 'Only the person who ran this command can use this.', flags: MessageFlags.Ephemeral })
          .catch((): null => null);
        return false;
      }
      return true;
    },
    max:  1,
    time: 30_000,
  });

  collector.on('collect', async (i: any) => {
    await i.deferUpdate().catch((): null => null);
    const action = i.customId.split(':')[1] as string;

    if (action === 'cancel') {
      await panel.edit(buildMassNickCancelledPayload()).catch((): null => null);
      return;
    }

    await runMassNick(panel, guild, mode, word, action as MassNickTargetType, message.author.username, client);
  });

  collector.on('end', async (_: any, reason: string) => {
    if (reason === 'time') {
      await panel.edit(buildMassNickTimedOutPayload()).catch((): null => null);
    }
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Slash execute
// ─────────────────────────────────────────────────────────────────────────────

export async function slashExecute(
  interaction: any,
  client:      LevitateClient,
): Promise<any> {
  const ctx   = { interaction };
  const guild = interaction.guild;
  if (!guild) {
    await interaction.deferReply();
    return sendError(ctx, 'This command can only be used in a server.');
  }

  const invokerMember = interaction.member;
  if (!invokerMember?.permissions?.has?.(PermissionFlagsBits.ManageNicknames)) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    return sendError(ctx, 'You need the **Manage Nicknames** permission to use this command.');
  }
  if (!guild.members.me?.permissions?.has?.(PermissionFlagsBits.ManageNicknames)) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    return sendError(ctx, 'I need the **Manage Nicknames** permission to change nicknames.');
  }

  const sub  = interaction.options.getSubcommand() as string;
  const word: string | null = interaction.options.getString('word') ?? null;
  const mode = sub as MassNickMode;

  if (mode !== 'reset' && word && /\s/.test(word)) {
    await interaction.deferReply();
    return sendError(ctx, 'The word must contain no spaces. Use a single token.');
  }

  const token = `${interaction.id}-${Date.now()}`;
  await interaction.reply(buildMassNickTargetPanel(mode, word, guild.memberCount, token));
  const panel = await interaction.fetchReply().catch((): null => null);
  if (!panel) return;

  const collector = panel.createMessageComponentCollector({
    filter: (i: any) => {
      if (!i.customId.startsWith('massnick:') || !i.customId.endsWith(`:${token}`)) return false;
      if (i.user.id !== interaction.user.id) {
        i.reply({ content: 'Only the person who ran this command can use this.', flags: MessageFlags.Ephemeral })
          .catch((): null => null);
        return false;
      }
      return true;
    },
    max:  1,
    time: 30_000,
  });

  collector.on('collect', async (i: any) => {
    await i.deferUpdate().catch((): null => null);
    const parts  = i.customId.split(':');
    const action = parts[1] as string;

    if (action === 'cancel') {
      await panel.edit(buildMassNickCancelledPayload()).catch((): null => null);
      return;
    }

    const targetType = action as MassNickTargetType;
    await runMassNick(panel, guild, mode, word, targetType, interaction.user.username, client);
  });

  collector.on('end', async (_: any, reason: string) => {
    if (reason === 'time') {
      await panel.edit(buildMassNickTimedOutPayload()).catch((): null => null);
    }
  });
}
