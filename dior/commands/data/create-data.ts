// xoxo/commands/data/create-data.ts
//
// Command to save a message, embed, or CV2 payload for later use.
// Requires Administrator permission.
//
// Usage:
//   $create-data message <text>          — save a plain-text message
//   $create-data embed <json>            — save an embed JSON payload
//   $create-data cv2 <json>              — save a Components V2 JSON payload
//   (any of the above with a file attachment instead of inline data)
//
// Aliases for the type argument:
//   message → messages
//   embed   → embeds
//   cv2     → components
//
// Flow:
//   1. Validate the data (non-empty / valid JSON).
//   2. Ask the user for a name (message collector, 60 s).
//   3. Validate the name (≤50 chars, no conflict in this guild).
//   4. Show a Confirm / Cancel button prompt.
//   5. On confirm → post metadata + payload file to savedDataChannelId,
//      then post the divider, then save {name, guildId, messageId, type} to DB.
//   6. Report success or failure to the user.
//
// Placeholder tokens (${user_name}, ${server_name}, …) embedded in the data
// are documented in xoxo/helpers/placeholders.ts and are resolved at USE time,
// not at save time. The raw payload is stored as-is.

import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  MessageFlags,
  SeparatorBuilder,
  TextDisplayBuilder,
  AttachmentBuilder,
} from 'discord.js';
import type { CassieClient } from '../../structures/CassieClient.js';
import { authorOnlyFilter } from '../../helpers/panelGuard.js';
import { sendError } from '../../components/statusMessages.js';
import { emojis } from '../../emojis.js';
import { config } from '../../config.js';

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const MAX_NAME_LENGTH  = 50;
const MAX_PAYLOAD_BYTES = 512 * 1024; // 512 KB
const NAME_COLLECT_MS  = 60_000;
const CONFIRM_MS       = 60_000;

const TYPE_MAP: Record<string, 'message' | 'embed' | 'cv2'> = {
  message:    'message',
  messages:   'message',
  embed:      'embed',
  embeds:     'embed',
  cv2:        'cv2',
  components: 'cv2',
};

// ─────────────────────────────────────────────────────────────────────────────
// Command metadata
// ─────────────────────────────────────────────────────────────────────────────

export const options = {
  name: 'create-data',
  aliases: ['createdata', 'cdata'] as string[],
  description: 'Save a message, embed, or CV2 payload for later use.',
  usage: `create-data message <text or attachment>
create-data embed <json or attachment>
create-data cv2 <json or attachment>`,
  category: 'data',
  owner: false,
  cooldown: 0,
};

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Strip the first whitespace-delimited token from a raw-args string. */
function stripFirstToken(raw: string): string {
  const s = raw.replace(/^\s+/, '');
  const m = s.match(/^\S+\s*/);
  return m ? s.slice(m[0].length) : '';
}

/** Build a CV2 confirmation prompt with Confirm + Cancel buttons. */
function buildConfirmPayload(
  type: 'message' | 'embed' | 'cv2',
  name: string,
  confirmId: string,
  cancelId: string,
  disabled = false,
  timedOut = false,
): any {
  const typeLabel = type === 'message' ? 'Message' : type === 'embed' ? 'Embed' : 'CV2';
  const container = new ContainerBuilder().setAccentColor(parseInt(config.defaultAccentColor.replace('#', ''), 16))
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `## ${emojis.blackCards} Save this ${typeLabel}?`,
      ),
    )
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `- **Name:** \`${name}\`\n- **Type:** ${typeLabel}`,
      ),
    )
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
    .addActionRowComponents(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(confirmId)
          .setLabel('Save')
          .setStyle(ButtonStyle.Success)
          .setDisabled(disabled),
        new ButtonBuilder()
          .setCustomId(cancelId)
          .setLabel('Cancel')
          .setStyle(ButtonStyle.Danger)
          .setDisabled(disabled),
      ),
    );

  if (timedOut) {
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent('-# Confirmation timed out.'),
    );
  }

  return {
    components: [container],
    flags: MessageFlags.IsComponentsV2,
    allowedMentions: { parse: [] },
  };
}

/** Validate JSON for embed payloads — returns parsed or throws. */
function parseEmbedJson(raw: string): any {
  const parsed = JSON.parse(raw); // throws on invalid JSON
  if (Array.isArray(parsed)) {
    if (parsed.length === 0) throw new Error('Embed array is empty.');
    return parsed;
  }
  if (parsed && typeof parsed === 'object') return parsed;
  throw new Error('Expected a JSON object or array of embed objects.');
}

/** Validate JSON for CV2 payloads — returns parsed or throws. */
function parseCv2Json(raw: string): any {
  const parsed = JSON.parse(raw);
  if (Array.isArray(parsed)) {
    if (parsed.length === 0) throw new Error('CV2 components array is empty.');
    return parsed;
  }
  if (parsed && typeof parsed === 'object') return parsed;
  throw new Error('Expected a JSON object or array of component objects.');
}

// ─────────────────────────────────────────────────────────────────────────────
// Main execute
// ─────────────────────────────────────────────────────────────────────────────

export async function prefixExecute(
  message: any,
  args: string[],
  client: CassieClient,
) {
  const ctx = { message };

  // ── 0. Guard: must be in a guild ─────────────────────────────────────────
  if (!message.guild) {
    return sendError(ctx, 'This command can only be used in a server.');
  }

  const authorPerms = message.channel.permissionsFor?.(message.member);
  if (!authorPerms?.has?.('Administrator')) {
    return sendError(ctx, 'You need the **Administrator** permission to use this command.');
  }

  if (!client.db) {
    return sendError(ctx, 'Database is unavailable.');
  }

  // ── 1. Parse type argument ───────────────────────────────────────────────
  const typeRaw = (args[0] ?? '').toLowerCase();
  const type    = TYPE_MAP[typeRaw];

  if (!args[0] || !type) {
    return sendError(
      { message },
      `**Usage:**\n\`\`\`\n${options.usage}\n\`\`\``,
    );
  }

  // ── 2. Collect the raw data ───────────────────────────────────────────────
  const fullRaw: string =
    typeof message.commandRawArgs === 'string'
      ? message.commandRawArgs
      : args.join(' ');

  let rawData = stripFirstToken(fullRaw).trim();

  // If no inline data was provided, try to read from a file attachment.
  // If both are provided, inline data wins (attachment is silently ignored).
  if (!rawData && message.attachments?.size) {
    const attachment = message.attachments.first();
    if (attachment.size > MAX_PAYLOAD_BYTES) {
      return sendError(
        ctx,
        `Attachment is too large (max ${MAX_PAYLOAD_BYTES.toLocaleString()} bytes).`,
      );
    }
    try {
      const res = await fetch(attachment.url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      rawData = (await res.text()).trim();
    } catch (err: any) {
      return sendError(ctx, `Failed to read attachment: \`${err.message}\``);
    }
    if (!rawData) return sendError(ctx, 'The attached file is empty.');
  }

  if (!rawData) {
    return sendError(
      ctx,
      `Provide the ${type === 'message' ? 'message text' : 'JSON payload'} after the type, or attach a file.`,
    );
  }

  // ── 3. Validate data ──────────────────────────────────────────────────────
  if (type === 'embed') {
    try {
      parseEmbedJson(rawData);
    } catch (err: any) {
      return sendError(ctx, `Invalid embed JSON: \`${err.message}\``);
    }
  } else if (type === 'cv2') {
    try {
      parseCv2Json(rawData);
    } catch (err: any) {
      return sendError(ctx, `Invalid CV2 JSON: \`${err.message}\``);
    }
  }
  // For 'message', any non-empty string is valid.

  // ── 4. Ask for a name ────────────────────────────────────────────────────
  const askPayload: any = {
    components: [
      new ContainerBuilder().setAccentColor(parseInt(config.defaultAccentColor.replace('#', ''), 16))
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            `## ${emojis.blackCards} What should this be saved as?\n` +
            `-# Reply with a name (max ${MAX_NAME_LENGTH} characters). You have 60 seconds.`,
          ),
        ),
    ],
    flags: MessageFlags.IsComponentsV2,
    allowedMentions: { parse: [] },
  };

  const askMsg = await message.reply(askPayload).catch((): null => null);
  if (!askMsg) return sendError(ctx, 'Failed to send the name prompt.');

  // Collect the name from the same user in the same channel
  let collectedName: string;
  try {
    const collected = await (message.channel as any).awaitMessages({
      filter: (m: any) => m.author.id === message.author.id,
      max: 1,
      time: NAME_COLLECT_MS,
      errors: ['time'],
    });
    collectedName = collected.first()?.content?.trim() ?? '';

    // Delete the user's name reply to keep the channel tidy
    collected.first()?.delete().catch((): null => null);
  } catch {
    // Timed out
    await askMsg.edit({
      components: [
        new ContainerBuilder().setAccentColor(parseInt(config.defaultAccentColor.replace('#', ''), 16)).addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            `${emojis.redcross} Timed out waiting for a name. Cancelled.`,
          ),
        ),
      ],
      flags: MessageFlags.IsComponentsV2,
      allowedMentions: { parse: [] },
    }).catch((): null => null);
    return;
  }

  if (!collectedName) {
    await askMsg.edit({
      components: [
        new ContainerBuilder().setAccentColor(parseInt(config.defaultAccentColor.replace('#', ''), 16)).addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            `${emojis.redcross} Name cannot be empty. Cancelled.`,
          ),
        ),
      ],
      flags: MessageFlags.IsComponentsV2,
      allowedMentions: { parse: [] },
    }).catch((): null => null);
    return;
  }

  if (collectedName.length > MAX_NAME_LENGTH) {
    await askMsg.edit({
      components: [
        new ContainerBuilder().setAccentColor(parseInt(config.defaultAccentColor.replace('#', ''), 16)).addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            `${emojis.redcross} Name is too long (${collectedName.length} / ${MAX_NAME_LENGTH} characters). Cancelled.`,
          ),
        ),
      ],
      flags: MessageFlags.IsComponentsV2,
      allowedMentions: { parse: [] },
    }).catch((): null => null);
    return;
  }

  // ── 5. Check name uniqueness in this guild ────────────────────────────────
  let exists: boolean;
  try {
    exists = await client.db.savedDataNameExists(message.guild.id, collectedName);
  } catch {
    await askMsg.edit({
      components: [
        new ContainerBuilder().setAccentColor(parseInt(config.defaultAccentColor.replace('#', ''), 16)).addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            `${emojis.redcross} Database error while checking name availability. Please try again.`,
          ),
        ),
      ],
      flags: MessageFlags.IsComponentsV2,
      allowedMentions: { parse: [] },
    }).catch((): null => null);
    return;
  }

  if (exists) {
    await askMsg.edit({
      components: [
        new ContainerBuilder().setAccentColor(parseInt(config.defaultAccentColor.replace('#', ''), 16)).addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            `${emojis.redcross} A saved item named \`${collectedName}\` already exists in this server. Cancelled.`,
          ),
        ),
      ],
      flags: MessageFlags.IsComponentsV2,
      allowedMentions: { parse: [] },
    }).catch((): null => null);
    return;
  }

  // ── 6. Show confirmation prompt ───────────────────────────────────────────
  const confirmId = `create:confirm:${message.author.id}:${Date.now()}`;
  const cancelId  = `create:cancel:${message.author.id}:${Date.now()}`;

  await askMsg.edit(
    buildConfirmPayload(type, collectedName, confirmId, cancelId),
  ).catch((): null => null);

  // Await button interaction from the original author only
  let interaction: any;
  try {
    interaction = await (askMsg as any).awaitMessageComponent({
      filter: (i: any) => authorOnlyFilter(
        i, message.author.id,
        (cid) => cid === confirmId || cid === cancelId,
      ),
      time: CONFIRM_MS,
    });
  } catch {
    // Timed out
    await askMsg.edit(
      buildConfirmPayload(type, collectedName, confirmId, cancelId, true, true),
    ).catch((): null => null);
    return;
  }

  await interaction.deferUpdate().catch((): null => null);

  if (interaction.customId === cancelId) {
    await askMsg.edit({
      components: [
        new ContainerBuilder().setAccentColor(parseInt(config.defaultAccentColor.replace('#', ''), 16)).addTextDisplayComponents(
          new TextDisplayBuilder().setContent(`${emojis.redcross} Cancelled.`),
        ),
      ],
      flags: MessageFlags.IsComponentsV2,
      allowedMentions: { parse: [] },
    }).catch((): null => null);
    return;
  }

  // ── 7. Confirmed — post to the storage channel ────────────────────────────
  await askMsg.edit({
    components: [
      new ContainerBuilder().setAccentColor(parseInt(config.defaultAccentColor.replace('#', ''), 16)).addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `${emojis.loading} Saving \`${collectedName}\`…`,
        ),
      ),
    ],
    flags: MessageFlags.IsComponentsV2,
    allowedMentions: { parse: [] },
  }).catch((): null => null);

  const storageChannelId = config.savedDataChannelId?.trim();
  if (!storageChannelId) {
    await askMsg.edit({
      components: [
        new ContainerBuilder().setAccentColor(parseInt(config.defaultAccentColor.replace('#', ''), 16)).addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            `${emojis.redcross} Storage channel is not configured (\`config.savedDataChannelId\`).`,
          ),
        ),
      ],
      flags: MessageFlags.IsComponentsV2,
      allowedMentions: { parse: [] },
    }).catch((): null => null);
    return;
  }

  const storageChannel: any =
    client.channels.cache.get(storageChannelId) ??
    await client.channels.fetch(storageChannelId).catch((): null => null);

  if (!storageChannel || typeof storageChannel.send !== 'function') {
    await askMsg.edit({
      components: [
        new ContainerBuilder().setAccentColor(parseInt(config.defaultAccentColor.replace('#', ''), 16)).addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            `${emojis.redcross} Could not reach the storage channel. Check the channel ID in config.`,
          ),
        ),
      ],
      flags: MessageFlags.IsComponentsV2,
      allowedMentions: { parse: [] },
    }).catch((): null => null);
    return;
  }

  // Build the file attachment
  const fileExt      = type === 'message' ? 'txt' : 'json';
  const safeFileName = collectedName
    .replace(/[^a-z0-9_\-. ]/gi, '_')
    .replace(/\s+/g, '_')
    .slice(0, 80);
  const fileName   = `${safeFileName}.${fileExt}`;
  const fileBuffer = Buffer.from(rawData, 'utf-8');
  const attachment = new AttachmentBuilder(fileBuffer, { name: fileName });

  const unixSec    = Math.floor(Date.now() / 1000);
  const relativeTs = `<t:${unixSec}:R>`;
  const fullTs     = `<t:${unixSec}:F>`;

  const typeLabel = type === 'message' ? 'Message' : type === 'embed' ? 'Embed' : 'CV2';

  const metaText =
    `**Server:** ${message.guild.name} (\`${message.guild.id}\`)\n` +
    `**User:** ${message.author.tag ?? message.author.username} (<@${message.author.id}> \`${message.author.id}\`)\n` +
    `**Name:** \`${collectedName}\`\n` +
    `**Type:** ${typeLabel}\n` +
    `**Time:** ${fullTs} (${relativeTs})`;

  const storageMsg = await storageChannel.send({
    content: metaText,
    files: [attachment],
    allowedMentions: { parse: [] },
  }).catch((): null => null);

  if (!storageMsg) {
    await askMsg.edit({
      components: [
        new ContainerBuilder().setAccentColor(parseInt(config.defaultAccentColor.replace('#', ''), 16)).addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            `${emojis.redcross} Failed to post to the storage channel.`,
          ),
        ),
      ],
      flags: MessageFlags.IsComponentsV2,
      allowedMentions: { parse: [] },
    }).catch((): null => null);
    return;
  }

  // Send the divider
  await storageChannel.send({
    content: config.dataDivider,
    allowedMentions: { parse: [] },
  }).catch((): null => null);

  // ── 8. Persist to database ────────────────────────────────────────────────
  const saveResult = await client.db.createSavedData({
    name:      collectedName,
    guildId:   message.guild.id,
    messageId: storageMsg.id,
    type,
    createdBy: message.author.id,
  });

  if (saveResult === 'duplicate') {
    await askMsg.edit({
      components: [
        new ContainerBuilder().setAccentColor(parseInt(config.defaultAccentColor.replace('#', ''), 16)).addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            `${emojis.redcross} A name conflict was detected at the database level (concurrent save). ` +
            `Payload is in the storage channel (message ID: \`${storageMsg.id}\`) but was not recorded. ` +
            `Choose a different name and try again.`,
          ),
        ),
      ],
      flags: MessageFlags.IsComponentsV2,
      allowedMentions: { parse: [] },
    }).catch((): null => null);
    return;
  }

  if (saveResult === false) {
    await askMsg.edit({
      components: [
        new ContainerBuilder().setAccentColor(parseInt(config.defaultAccentColor.replace('#', ''), 16)).addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            `${emojis.redcross} The payload was posted to the storage channel (message ID: \`${storageMsg.id}\`) **but the database write failed**. You may need to save the entry manually.`,
          ),
        ),
      ],
      flags: MessageFlags.IsComponentsV2,
      allowedMentions: { parse: [] },
    }).catch((): null => null);
    return;
  }

  // ── 9. Success ────────────────────────────────────────────────────────────
  await askMsg.edit({
    components: [
      new ContainerBuilder().setAccentColor(parseInt(config.defaultAccentColor.replace('#', ''), 16))
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            `${emojis.blacktick} Saved **${typeLabel}** as \`${collectedName}\` successfully.`,
          ),
        )
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            `-# Message ID: \`${storageMsg.id}\` · Guild: \`${message.guild.id}\``,
          ),
        ),
    ],
    flags: MessageFlags.IsComponentsV2,
    allowedMentions: { parse: [] },
  }).catch((): null => null);
}
