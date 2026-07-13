// xoxo/commands/moderation/massnick.ts
//
// Change the server nickname of every (non-bot) member at once.
//
// Modes:
//   massnick prepend <word>   — "word CurrentNick"
//   massnick prefix  <word>   — alias for prepend
//   massnick append  <word>   — "CurrentNick word"
//   massnick suffix  <word>   — alias for append
//   massnick reset            — remove all server nicknames
//
// The word for prepend/append must be a single word (no spaces).
// prepend/append work on the member's current displayed name in this server
// (i.e. their server nickname if set, otherwise their display name).
// Nicknames are capped at 32 characters (Discord limit).
//
// Requires ManageNicknames (+ ManageGuild recommended so regular mods can't abuse it).
// Always asks for confirmation.

import { PermissionFlagsBits } from 'discord.js';
import type { LevitateClient } from '../../structures/LevitateClient.js';
import { sendError, sendLoading, sendSuccess } from '../../components/statusMessages.js';
import { authorOnlyFilter } from '../../helpers/panelGuard.js';
import {
  buildActionConfirmPayload,
  buildActionTimedOutPayload,
  buildActionCancelledPayload,
} from '../../components/purgeConfirm.js';

export const options = {
  name:        'massnick',
  aliases:     ['massnickname', 'mn'] as string[],
  description: 'Change the nickname of every member at once (prepend, append, or reset).',
  usage: `massnick prepend <word>
massnick prefix  <word>
massnick append  <word>
massnick suffix  <word>
massnick reset`,
  category: 'moderation',
  owner:    false,
  cooldown: 10,
};

const MAX_NICK     = 32;
const CONFIRM_TITLE = 'Confirm Mass Nickname';

const MODES = ['prepend', 'prefix', 'append', 'suffix', 'reset'] as const;
type Mode = typeof MODES[number];

// ─────────────────────────────────────────────────────────────────────────────
// Confirmation helper
// ─────────────────────────────────────────────────────────────────────────────

async function askConfirm(
  message:   any,
  desc:      string,
  onConfirm: () => Promise<void>,
): Promise<void> {
  const confirmId = `mn:confirm:${message.id}`;
  const cancelId  = `mn:cancel:${message.id}`;

  const confirmMsg = await message.channel
    .send(buildActionConfirmPayload(confirmId, cancelId, CONFIRM_TITLE, desc))
    .catch((): null => null);
  if (!confirmMsg) return;

  const collector = confirmMsg.createMessageComponentCollector({
    filter: (i: any) => authorOnlyFilter(
        i, message.author.id,
        (cid) => cid === confirmId || cid === cancelId,
      ),
    max:  1,
    time: 30_000,
  });

  collector.on('collect', async (i: any) => {
    await i.deferUpdate().catch((): null => null);
    if (i.customId === confirmId) {
      await confirmMsg.delete().catch((): null => null);
      await onConfirm();
    } else {
      await confirmMsg
        .edit(buildActionCancelledPayload(confirmId, cancelId, CONFIRM_TITLE, desc))
        .catch((): null => null);
      setTimeout(async () => {
        await confirmMsg.delete().catch((): null => null);
        await message.delete().catch((): null => null);
      }, 3_000);
    }
  });

  collector.on('end', (_: any, reason: string) => {
    if (reason !== 'time') return;
    confirmMsg
      .edit(buildActionTimedOutPayload(confirmId, cancelId, CONFIRM_TITLE, desc))
      .catch((): null => null);
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Core mass-nickname logic
// ─────────────────────────────────────────────────────────────────────────────

async function runMassNick(
  ctx:     { message?: any; interaction?: any; channel?: any },
  guild:   any,
  channel: any,
  mode:    Mode,
  word:    string | null,
  invoker: string,
  client:  LevitateClient,
): Promise<void> {
  const processingMsg = await sendLoading(
    { channel },
    'Fetching members — this may take a moment on large servers…',
  ).catch((): null => null);

  // Try a full member fetch; fall back to cached members if the gateway
  // rejects the request (e.g. Server Members intent not enabled in portal).
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

  const auditReason = `massnick ${mode}${word ? ` "${word}"` : ''} by ${invoker}`;
  const selfId      = client.user?.id;

  for (const [, member] of members) {
    const isSelf = selfId && member.user.id === selfId;

    // For other bots or members the bot cannot manage, count as failed.
    // The bot can always change its own nickname (no manageable check needed).
    if (!isSelf && !member.manageable) { failed++; continue; }

    let newNick: string | null;

    if (mode === 'reset') {
      newNick = null;
    } else {
      const base = member.displayName; // server nick ?? globalName ?? username
      if (mode === 'prepend' || mode === 'prefix') {
        newNick = `${word} ${base}`.slice(0, MAX_NICK);
      } else {
        // append / suffix
        newNick = `${base} ${word}`.slice(0, MAX_NICK);
      }
      // Don't waste an API call if nickname already equals the target
      if (newNick === member.nickname) { skipped++; continue; }
    }

    // For reset: skip if they already have no nickname
    if (mode === 'reset' && member.nickname === null) { skipped++; continue; }

    const ok = await member
      .setNickname(newNick, auditReason)
      .then(() => true)
      .catch(() => false);

    if (ok) changed++;
    else    failed++;
  }

  await (processingMsg as any)?.delete().catch((): null => null);

  let result = `**${changed}** nickname${changed !== 1 ? 's' : ''} updated.`;
  if (skipped > 0) result += ` ${skipped} skipped (already correct).`;
  if (failed  > 0) result += ` ${failed} failed (role too high or unmanageable).`;
  if (usingCache) result += `\n-# Member list may be incomplete — enable the Server Members intent in the Discord Developer Portal for full coverage.`;

  await sendSuccess(ctx, result);
}

// ─────────────────────────────────────────────────────────────────────────────
// Prefix execute
// ─────────────────────────────────────────────────────────────────────────────

export async function prefixExecute(
  message: any,
  args:    string[],
  _client: LevitateClient,
): Promise<any> {
  const ctx   = { message };
  const guild = message.guild;
  if (!guild) return sendError(ctx, 'This command can only be used in a server.');

  const invokerPerms = message.channel.permissionsFor?.(message.member);
  if (!invokerPerms?.has?.(PermissionFlagsBits.ManageNicknames)) {
    return sendError(ctx, 'You need the **Manage Nicknames** permission to use this command.');
  }

  const botMember = guild.members.me;
  if (botMember && !botMember.permissions.has(PermissionFlagsBits.ManageNicknames)) {
    return sendError(ctx, 'I need the **Manage Nicknames** permission to change nicknames.');
  }

  const mode = args[0]?.toLowerCase() as Mode | undefined;
  if (!mode || !(MODES as readonly string[]).includes(mode)) {
    return sendError(ctx, `Usage:\n\`\`\`\n${options.usage}\n\`\`\``);
  }

  const isReset   = mode === 'reset';
  const isPrepend = mode === 'prepend' || mode === 'prefix';

  let word: string | null = null;
  if (!isReset) {
    word = args[1] ?? null;
    if (!word) {
      return sendError(ctx, `Provide a single word to ${isPrepend ? 'prepend' : 'append'}. Example: \`massnick ${mode} HLW\``);
    }
    if (/\s/.test(word)) {
      return sendError(ctx, 'The word must contain no spaces. Use a single token.');
    }
  }

  const count = guild.memberCount;
  let desc: string;
  if (isReset) {
    desc = `Are you sure you want to **reset server nicknames** for all ~**${count}** members in this server?\n-# Members with roles above mine will be skipped.`;
  } else if (isPrepend) {
    desc = `Are you sure you want to **prepend \`${word}\`** to every member's nickname?\n**Example:** \`Jay\` → \`${word} Jay\`\n-# Applies to ~**${count}** members. Members with higher roles are skipped.`;
  } else {
    desc = `Are you sure you want to **append \`${word}\`** to every member's nickname?\n**Example:** \`Jay\` → \`Jay ${word}\`\n-# Applies to ~**${count}** members. Members with higher roles are skipped.`;
  }

  return askConfirm(message, desc, () =>
    runMassNick(ctx, guild, message.channel, mode, word, message.author.username, _client),
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Slash execute
// ─────────────────────────────────────────────────────────────────────────────

export async function slashExecute(
  interaction: any,
  _client:     LevitateClient,
): Promise<any> {
  await interaction.deferReply();
  const ctx   = { interaction };
  const guild = interaction.guild;
  if (!guild) return sendError(ctx, 'This command can only be used in a server.');

  const invokerMember = interaction.member;
  if (!invokerMember?.permissions?.has?.(PermissionFlagsBits.ManageNicknames)) {
    return sendError(ctx, 'You need the **Manage Nicknames** permission to use this command.');
  }

  const botMember = guild.members.me;
  if (botMember && !botMember.permissions.has(PermissionFlagsBits.ManageNicknames)) {
    return sendError(ctx, 'I need the **Manage Nicknames** permission to change nicknames.');
  }

  const sub  = interaction.options.getSubcommand() as string;
  const word: string | null = interaction.options.getString('word') ?? null;
  const mode = sub as Mode;

  // Validate word (slash doesn't enforce single-word via Discord; we do it here)
  if (mode !== 'reset' && word && /\s/.test(word)) {
    return sendError(ctx, 'The word must contain no spaces. Use a single token.');
  }

  // ── Build confirmation description ────────────────────────────────────────
  const isReset   = mode === 'reset';
  const isPrepend = mode === 'prepend';
  const count     = guild.memberCount;

  let desc: string;
  if (isReset) {
    desc = `Are you sure you want to **reset server nicknames** for all ~**${count}** members in this server?\n-# Members with roles above mine will be skipped.`;
  } else if (isPrepend) {
    desc = `Are you sure you want to **prepend \`${word}\`** to every member's nickname?\n**Example:** \`Jay\` → \`${word} Jay\`\n-# Applies to ~**${count}** members. Members with higher roles are skipped.`;
  } else {
    desc = `Are you sure you want to **append \`${word}\`** to every member's nickname?\n**Example:** \`Jay\` → \`Jay ${word}\`\n-# Applies to ~**${count}** members. Members with higher roles are skipped.`;
  }

  const confirmId = `mn:confirm:${interaction.id}`;
  const cancelId  = `mn:cancel:${interaction.id}`;

  await interaction.editReply(
    buildActionConfirmPayload(confirmId, cancelId, CONFIRM_TITLE, desc),
  );
  const confirmMsg = await interaction.fetchReply().catch((): null => null);
  if (!confirmMsg) return;

  // After confirmation the result is sent to the channel directly —
  // the interaction reply is deleted on confirm / after 3 s on cancel.
  const channelCtx = { channel: interaction.channel };

  const collector = confirmMsg.createMessageComponentCollector({
    filter: (i: any) => authorOnlyFilter(
        i, interaction.user.id,
        (cid) => cid === confirmId || cid === cancelId,
      ),
    max:  1,
    time: 30_000,
  });

  collector.on('collect', async (i: any) => {
    await i.deferUpdate().catch((): null => null);
    if (i.customId === confirmId) {
      await interaction.deleteReply().catch((): null => null);
      await runMassNick(channelCtx, guild, interaction.channel, mode, word, interaction.user.username, _client);
    } else {
      await i
        .editReply(buildActionCancelledPayload(confirmId, cancelId, CONFIRM_TITLE, desc))
        .catch((): null => null);
      setTimeout(() => interaction.deleteReply().catch((): null => null), 3_000);
    }
  });

  collector.on('end', (_: any, reason: string) => {
    if (reason !== 'time') return;
    confirmMsg
      .edit(buildActionTimedOutPayload(confirmId, cancelId, CONFIRM_TITLE, desc))
      .catch((): null => null);
  });
}
