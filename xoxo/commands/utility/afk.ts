// xoxo/commands/utility/afk.ts
//
// Set your Away from Keyboard status.
//
// Prefix:  $afk
//          $afk <reason>
//          $afk <reason> <image URL>  (or attach an image)
//
// Shows a Server AFK / Global AFK / Cancel confirmation panel. On confirm,
// AFK is stored in DB and removed automatically when the user sends a message.

import {
  ContainerBuilder,
  MessageFlags,
  TextDisplayBuilder,
} from 'discord.js';
import type { LevitateClient } from '../../structures/LevitateClient.js';
import { sendError } from '../../components/statusMessages.js';
import { buildAfkConfirmationPayload, type AfkScope } from '../../components/afk.js';
import { emojis } from '../../emojis.js';
import { authorOnlyFilter } from '../../helpers/panelGuard.js';
import { parseSayText } from '../../helpers/emojiParser.js';
import { resolveEmoji } from '../../helpers/emojiResolver.js';

export const options = {
  name:        'afk',
  aliases:     [] as string[],
  description: 'Set your Away from Keyboard status.',
  usage: `afk
afk <reason>
afk <reason> <image URL>`,
  category: 'utility',
  owner:    false,
  cooldown: 5,
};

interface ParsedAfkInput {
  reason:   string;
  imageUrl: string | null;
  sinceAt:  Date;
  tillAt:   Date | null;
}

// ─── Input parser ─────────────────────────────────────────────────────────────

async function parseAfkInput(
  rawInput:      string,
  attachmentUrl: string | null,
  client:        LevitateClient,
  guild:         any,
): Promise<ParsedAfkInput | null> {
  let text     = rawInput.trim();
  let imageUrl = attachmentUrl;

  // Extract trailing image URL if no attachment was provided.
  if (!imageUrl) {
    const parts = text.split(/\s+/);
    const last  = parts[parts.length - 1];
    if (/^https?:\/\/\S+$/i.test(last ?? '')) {
      imageUrl = last;
      parts.pop();
      text = parts.join(' ').trim();
    }
  }

  // Normalise escaped newlines: \\n → literal \n.
  const normalized = text
    .replace(/\\\\n/g, '\u0000')
    .replace(/\\n/g, '\n')
    .replace(/\u0000/g, '\\n');

  const { text: parsedReason, invalid } = await parseSayText(
    normalized,
    (id) => resolveEmoji(client, id, guild),
  );
  if (invalid.length) return null;

  return {
    reason:   parsedReason.trim() || 'Reason not provided.',
    imageUrl,
    sinceAt:  new Date(),
    tillAt:   null,
  };
}

// ─── Status payload builder (used after button interaction) ───────────────────

function buildStatusPayload(icon: string, content: string) {
  const container = new ContainerBuilder().addTextDisplayComponents(
    new TextDisplayBuilder().setContent(`${icon} ${content}`),
  );
  return {
    components:      [container],
    flags:           MessageFlags.IsComponentsV2,
    allowedMentions: { parse: [] as any[] },
  };
}

// ─── Confirmation flow ────────────────────────────────────────────────────────

async function sendAfkConfirmation({
  client,
  message,
  interaction,
  userId,
  guildId,
  parsed,
}: {
  client:       LevitateClient;
  message?:     any;
  interaction?: any;
  userId:       string;
  guildId:      string | null;
  parsed:       ParsedAfkInput;
}) {
  const sessionId = `${userId}:${Date.now()}`;
  const payload   = buildAfkConfirmationPayload({
    reason:   parsed.reason,
    imageUrl: parsed.imageUrl,
    sessionId,
  });

  const prompt = interaction
    ? (interaction.deferred
        ? await interaction.editReply(payload)
        : await interaction.reply({ ...payload, fetchReply: true }))
    : await message.reply({ ...payload, allowedMentions: { parse: [], repliedUser: false } });

  const collector = prompt.createMessageComponentCollector({
    filter: (i: any) => authorOnlyFilter(i, userId, (cid) => cid.startsWith(`afk:${sessionId}:`)),
    time:   60_000,
    max:    1,
  });

  collector.on('collect', async (i: any) => {
    const action = i.customId.split(':').pop() as AfkScope | 'cancel';

    if (action === 'cancel') {
      await i.update(buildStatusPayload(emojis.redcross, 'AFK confirmation cancelled.'))
        .catch((): null => null);
      return;
    }

    if (action === 'server' && !guildId) {
      await i.update(buildStatusPayload(emojis.redcross, 'Server AFK can only be used inside a server.'))
        .catch((): null => null);
      return;
    }

    await i.deferUpdate().catch((): null => null);

    if (!client.db) {
      await i.editReply(buildStatusPayload(emojis.redcross, 'Database unavailable. Cannot set AFK.'))
        .catch((): null => null);
      return;
    }

    await client.db.setAFK({
      userId,
      guildId:  action === 'server' ? guildId : null,
      scope:    action,
      reason:   parsed.reason,
      imageUrl: parsed.imageUrl,
      sinceAt:  parsed.sinceAt,
      tillAt:   parsed.tillAt,
    });

    await i.editReply(
      buildStatusPayload(
        emojis.blacktick,
        action === 'server'
          ? 'Your AFK has been set for this server.'
          : 'Your AFK has been set for all mutual servers.',
      ),
    ).catch((): null => null);
  });

  collector.on('end', async (_: any, reason: string) => {
    if (reason !== 'time') return;
    await prompt.edit(buildAfkConfirmationPayload({
      reason:   parsed.reason,
      imageUrl: parsed.imageUrl,
      sessionId,
      disabled: true,
      footer:   '-# Confirmation timed out',
    })).catch((): null => null);
  });
}

// ─── Prefix execute ───────────────────────────────────────────────────────────

export async function prefixExecute(
  message: any,
  args:    string[],
  client:  LevitateClient,
): Promise<any> {
  if (!client.db) return sendError({ message }, 'Database unavailable. Try again later.');

  const rawInput    = typeof message.commandRawArgs === 'string' ? message.commandRawArgs : args.join(' ');
  const attachment  = message.attachments?.first?.() ?? null;
  const parsed      = await parseAfkInput(rawInput, attachment?.url ?? null, client, message.guild);

  if (!parsed) {
    return sendError({ message }, 'Some emoji identifiers in your AFK reason were invalid.');
  }

  return sendAfkConfirmation({
    client,
    message,
    userId:  message.author.id,
    guildId: message.guildId,
    parsed,
  });
}

// ─── Slash execute ────────────────────────────────────────────────────────────

export async function slashExecute(
  interaction: any,
  client:      LevitateClient,
): Promise<any> {
  await interaction.deferReply();

  if (!client.db) return sendError({ interaction }, 'Database unavailable. Try again later.');

  const rawInput   = interaction.options.getString('text') ?? '';
  const attachment = interaction.options.getAttachment('image') ?? null;
  const parsed     = await parseAfkInput(rawInput, attachment?.url ?? null, client, interaction.guild);

  if (!parsed) {
    return sendError({ interaction }, 'Some emoji identifiers in your AFK reason were invalid.');
  }

  return sendAfkConfirmation({
    client,
    interaction,
    userId:  interaction.user.id,
    guildId: interaction.guildId,
    parsed,
  });
}
