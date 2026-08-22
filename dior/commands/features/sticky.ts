// xoxo/commands/utility/sticky.ts
//
// Manage sticky messages — a sticky re-posts itself to the bottom of the
// channel every time a new message arrives. One sticky per channel.
// Requires ManageGuild permission.
//
// Prefix subcommands:
//   sticky set data <saved-data-name>   — set sticky from this server's saved data
//   sticky set text <content>           — set a plain-text sticky
//   sticky enable                       — re-enable a disabled sticky
//   sticky disable                      — pause without deleting config
//   sticky view                         — show current sticky config

import { PermissionFlagsBits } from 'discord.js';
import type { LevitateClient } from '../../structures/LevitateClient.js';
import { sendError, sendInfo, sendSuccess } from '../../components/statusMessages.js';
import { setStickyAndPost, postStickyToChannel, invalidateStickyCache, type StickyType } from '../../helpers/stickyHelper.js';
import { parseSayText } from '../../helpers/emojiParser.js';
import { resolveEmoji } from '../../helpers/emojiResolver.js';

export const options = {
  name:        'sticky',
  aliases:     [] as string[],
  description: 'Manage sticky messages that re-post themselves at the bottom of the channel.',
  usage: `sticky set data <saved-data-name>
sticky set text <content>
sticky enable
sticky disable
sticky view`,
  category: 'features',
  owner:    false,
  cooldown: 3,
};

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function describeType(t: string): string {
  return t === 'cv2' ? 'CV2' : t === 'embed' ? 'Embed' : 'Text';
}

/**
 * Fetch a saved-data entry and return its resolved payload + StickyType.
 * Returns null with an error string if anything fails.
 */
async function resolveFromSavedData(
  client:  LevitateClient,
  guildId: string,
  name:    string,
): Promise<{ payload: string; type: StickyType } | { error: string }> {
  if (!client.db) return { error: 'Database is unavailable.' };

  const entry = await client.db.getSavedData(guildId, name).catch((): null => null);
  if (!entry) return { error: `No saved data named \`${name}\` found in this server.\n-# Run \`$view-data\` to see all saved entries.` };

  const storageChannelId: string = (client.config as any).savedDataChannelId ?? '';
  const storageChannel: any = storageChannelId
    ? (client.channels.cache.get(storageChannelId) ??
       await client.channels.fetch(storageChannelId).catch((): null => null))
    : null;
  if (!storageChannel) return { error: 'Cannot reach the saved-data storage channel.' };

  const storageMsg: any = await storageChannel.messages
    .fetch(entry.message_id)
    .catch((): null => null);
  if (!storageMsg) return { error: `The storage message for \`${name}\` no longer exists.` };

  const fileAttachment = storageMsg.attachments?.first?.();
  if (!fileAttachment) return { error: `No file attachment found for \`${name}\`.` };

  let payload: string;
  try {
    const res = await fetch(fileAttachment.url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    payload = (await res.text()).trim();
  } catch (err: any) {
    return { error: `Failed to download the saved data file: \`${err.message}\`` };
  }

  if (!payload) return { error: `The saved data file for \`${name}\` is empty.` };

  // Map saved-data types → sticky types
  const type: StickyType =
    entry.type === 'embed'   ? 'embed'  :
    entry.type === 'cv2'     ? 'cv2'    :
    'text'; // 'message' → plain text

  return { payload, type };
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared sub-command handlers
// ─────────────────────────────────────────────────────────────────────────────

async function handleSetData(
  ctx:       { message?: any; interaction?: any },
  channel:   any,
  guild:     any,
  name:      string,
  client:    LevitateClient,
): Promise<any> {
  if (!name.trim()) {
    return sendError(ctx, 'Provide a saved-data name. Example: `sticky set data welcome card`');
  }

  const result = await resolveFromSavedData(client, guild.id, name.trim());
  if ('error' in result) return sendError(ctx, result.error);

  const { payload, type } = result;

  await sendSuccess(ctx, `Sticky set from saved data \`${name.trim()}\` (type: **${describeType(type)}**). Posting now...`);
  const sent = await setStickyAndPost(client, channel, guild.id, channel.id, type, payload);
  if (!sent) {
    return sendError(ctx, 'Sticky was saved but could not be posted. Check the payload or my permissions.');
  }
}

async function handleSetText(
  ctx:     { message?: any; interaction?: any },
  channel: any,
  guild:   any,
  text:    string,
  client:  LevitateClient,
): Promise<any> {
  if (!text.trim()) {
    return sendError(ctx, 'Provide some text after `sticky set text`.');
  }
  if (text.length > 2000) {
    return sendError(ctx, `Text is too long (**${text.length}** chars). Maximum is **2000** characters.`);
  }

  const { text: parsedText, invalid } = await parseSayText(
    text.trim(),
    (id) => resolveEmoji(client, id, guild),
  );
  if (invalid.length) {
    return sendError(ctx, `Could not resolve emoji: ${invalid.map((i) => `\`${i}\``).join(', ')}`);
  }

  await sendSuccess(ctx, 'Sticky set (type: **Text**). Posting now...');
  const sent = await setStickyAndPost(client, channel, guild.id, channel.id, 'text', parsedText);
  if (!sent) {
    return sendError(ctx, 'Sticky was saved but could not be posted. Check my permissions.');
  }
}

async function handleEnable(
  ctx:     { message?: any; interaction?: any },
  channel: any,
  guild:   any,
  client:  LevitateClient,
): Promise<any> {
  if (!client.db) return sendError(ctx, 'Database is unavailable.');
  const data = await client.db.getSticky(guild.id, channel.id).catch((): null => null);
  if (!data) return sendError(ctx, 'No sticky is configured for this channel. Use `sticky set data/text` first.');
  if (data.enabled) return sendInfo(ctx, 'The sticky in this channel is **already enabled**.');

  await client.db.setStickyEnabled(guild.id, channel.id, true);
  invalidateStickyCache(guild.id, channel.id);
  await sendSuccess(ctx, 'Sticky **enabled** — re-posting now.');
  await postStickyToChannel(client, channel, guild.id, channel.id, data.type as StickyType, data.payload);
}

async function handleDisable(
  ctx:     { message?: any; interaction?: any },
  channel: any,
  guild:   any,
  client:  LevitateClient,
): Promise<any> {
  if (!client.db) return sendError(ctx, 'Database is unavailable.');
  const data = await client.db.getSticky(guild.id, channel.id).catch((): null => null);
  if (!data) return sendError(ctx, 'No sticky is configured for this channel.');
  if (!data.enabled) return sendInfo(ctx, 'The sticky in this channel is **already disabled**.');

  await client.db.setStickyEnabled(guild.id, channel.id, false);
  invalidateStickyCache(guild.id, channel.id);

  // Remove the live sticky message
  const key    = `${guild.id}-${channel.id}`;
  const prevId = client.stickyMessages.get(key) ?? data.last_message_id;
  if (prevId) {
    const prev = await channel.messages.fetch(prevId).catch((): null => null);
    if (prev) await prev.delete().catch((): null => null);
    client.stickyMessages.delete(key);
  }

  return sendSuccess(ctx, 'Sticky **disabled** for this channel.');
}

async function handleView(
  ctx:     { message?: any; interaction?: any },
  channel: any,
  guild:   any,
  client:  LevitateClient,
): Promise<any> {
  if (!client.db) return sendError(ctx, 'Database is unavailable.');
  const data = await client.db.getSticky(guild.id, channel.id).catch((): null => null);
  if (!data) return sendInfo(ctx, 'No sticky message is configured for this channel.');

  const status   = data.enabled ? 'Enabled' : 'Disabled';
  const typeLabel = describeType(data.type);

  if (data.type !== 'text') {
    return sendInfo(
      ctx,
      `**Sticky** in <#${channel.id}>\n**Type:** ${typeLabel} · **Status:** ${status}\n*(${data.payload.length.toLocaleString()} chars of ${typeLabel} JSON)*`,
    );
  }

  const preview = data.payload.length > 200 ? data.payload.slice(0, 200) + '…' : data.payload;
  return sendInfo(
    ctx,
    `**Sticky** in <#${channel.id}>\n**Type:** ${typeLabel} · **Status:** ${status}\n\`\`\`\n${preview}\n\`\`\``,
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Prefix execute
// ─────────────────────────────────────────────────────────────────────────────

export async function prefixExecute(
  message: any,
  args:    string[],
  client:  LevitateClient,
): Promise<any> {
  const ctx = { message };

  if (!message.guild) return sendError(ctx, 'This command can only be used in a server.');

  const invokerPerms = message.channel.permissionsFor?.(message.member);
  if (!invokerPerms?.has?.(PermissionFlagsBits.ManageGuild)) {
    return sendError(ctx, 'You need the **Manage Server** permission to manage sticky messages.');
  }

  const sub = args[0]?.toLowerCase();

  if (!sub || !['set', 'enable', 'disable', 'view'].includes(sub)) {
    return sendError(ctx, `Usage:\n\`\`\`\n${options.usage}\n\`\`\``);
  }

  if (sub === 'enable')  return handleEnable(ctx, message.channel, message.guild, client);
  if (sub === 'disable') return handleDisable(ctx, message.channel, message.guild, client);
  if (sub === 'view')    return handleView(ctx, message.channel, message.guild, client);

  // ── set ────────────────────────────────────────────────────────────────────
  const mode = args[1]?.toLowerCase();

  if (mode === 'data') {
    const name = args.slice(2).join(' ');
    return handleSetData(ctx, message.channel, message.guild, name, client);
  }

  if (mode === 'text') {
    // Preserve original spacing/newlines from message.commandRawArgs
    const fullRaw: string =
      typeof message.commandRawArgs === 'string' ? message.commandRawArgs : args.slice(0).join(' ');
    // Strip "set text " prefix (2 tokens)
    const text = fullRaw.replace(/^\S+\s*/, '').replace(/^\S+\s*/, '');
    return handleSetText(ctx, message.channel, message.guild, text, client);
  }

  return sendError(ctx, `Usage:\n\`\`\`\n${options.usage}\n\`\`\``);
}

// ─────────────────────────────────────────────────────────────────────────────
// Slash execute
// ─────────────────────────────────────────────────────────────────────────────

export async function slashExecute(
  interaction: any,
  client:      LevitateClient,
): Promise<any> {
  await interaction.deferReply();
  const ctx = { interaction };

  if (!interaction.guild) return sendError(ctx, 'This command can only be used in a server.');

  const invokerMember = interaction.member;
  if (!invokerMember?.permissions?.has?.(PermissionFlagsBits.ManageGuild)) {
    return sendError(ctx, 'You need the **Manage Server** permission to manage sticky messages.');
  }

  const sub     = interaction.options.getSubcommand() as string;
  const channel = interaction.channel;
  const guild   = interaction.guild;

  if (sub === 'enable')  return handleEnable(ctx, channel, guild, client);
  if (sub === 'disable') return handleDisable(ctx, channel, guild, client);
  if (sub === 'view')    return handleView(ctx, channel, guild, client);

  if (sub === 'set-data') {
    const name: string = interaction.options.getString('name', true);
    return handleSetData(ctx, channel, guild, name, client);
  }

  if (sub === 'set-text') {
    const text: string = interaction.options.getString('text', true);
    return handleSetText(ctx, channel, guild, text, client);
  }

  return sendError(ctx, 'Unknown sub-command.');
}
