// xoxo/components/utility/vanityRoleSender.ts
//
// Shared message dispatcher for the vanity-role system.
// Called when a member gains a role via the status-keyword or server-tag trigger.
//
// Mirrors the greetSender pattern: if both message_text and message_data are
// configured, they are merged into one Discord message; saved-data types
// (message / embed / cv2) each have their own merge strategy.
//
// Placeholders are resolved from the member's context just before sending.

import { MessageFlags } from 'discord.js';
import type { LevitateClient } from '../../structures/LevitateClient.js';
import type { VanityRoleSettingsDoc } from '../../database/database.js';
import { resolvePlaceholders, type PlaceholderContext } from '../../helpers/placeholders.js';
import webhookLogger from '../../utils/webhookLogger.js';
import { emojis } from '../../emojis.js';

// ─────────────────────────────────────────────────────────────────────────────
// Public entry point
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Send the configured vanity-role message to the guild's announcement channel.
 * `trigger`: which trigger fired ('status' | 'tag')
 * `event`:   'gain' — role was given; 'lose' — role was removed (currently
 *             only 'gain' is passed; kept for potential future expansion)
 */
export async function sendVanityRoleMessage(
  member:   any,
  client:   LevitateClient,
  settings: VanityRoleSettingsDoc,
  trigger:  'status' | 'tag',
  event:    'gain' | 'lose' = 'gain',
): Promise<void> {
  if (!client.db) return;

  // Resolve which message text/data to use
  const messageText = trigger === 'status' ? settings.status_message_text : settings.tag_message_text;
  const messageData = trigger === 'status' ? settings.status_message_data : settings.tag_message_data;

  if (!messageText && !messageData) return; // nothing to send

  // Resolve the announcement channel
  const channelId = settings.message_channel_id;
  if (!channelId) return;

  const guild   = member.guild;
  const channel: any =
    guild.channels.cache.get(channelId) ??
    await client.channels.fetch(channelId).catch((): null => null);

  if (!channel) return;

  const ctx: PlaceholderContext = {
    user:    member.user,
    member,
    channel,
    guild,
    client,
  };

  const resolvedText: string | null = messageText
    ? resolvePlaceholders(messageText, ctx)
    : null;

  if (messageData) {
    await dispatchSavedData(messageData, guild.id, channel, ctx, client, resolvedText).catch((err: unknown) => {
      webhookLogger.logError(err instanceof Error ? err : new Error(String(err)), 'vanityRoleSender: dispatchSavedData');
    });
  } else if (resolvedText) {
    await channel.send({
      content:         resolvedText,
      allowedMentions: { parse: ['users'] },
    }).catch((err: unknown) => {
      webhookLogger.logError(err instanceof Error ? err : new Error(String(err)), 'vanityRoleSender: plain text send');
    });
  }
}

/**
 * Send a simple built-in notice when a member loses the vanity role (keyword
 * left their status, or the server tag was unequipped). Unlike the gain
 * message, this is not user-configurable — it's a short, fixed CV2 notice.
 */
export async function sendVanityRoleLoseMessage(
  member:   any,
  client:   LevitateClient,
  settings: VanityRoleSettingsDoc,
  trigger:  'status' | 'tag',
): Promise<void> {
  const channelId = settings.message_channel_id;
  if (!channelId) return;

  const guild   = member.guild;
  const channel: any =
    guild.channels.cache.get(channelId) ??
    await client.channels.fetch(channelId).catch((): null => null);
  if (!channel) return;

  const reason = trigger === 'status'
    ? 'the status keyword is no longer in their status'
    : 'they unequipped the server tag';

  await channel.send({
    components: [{
      type:    17, // Container
      components: [{
        type:    10, // TextDisplay
        content: `${emojis.redcross} ${member.user?.username ?? 'A member'} lost the vanity role — ${reason}.`,
      }],
    }],
    flags:           MessageFlags.IsComponentsV2,
    allowedMentions: { parse: [] },
  }).catch((err: unknown) => {
    webhookLogger.logError(err instanceof Error ? err : new Error(String(err)), 'vanityRoleSender: lose notice send');
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal: fetch and send a saved-data entry (mirrors greetSender logic)
// ─────────────────────────────────────────────────────────────────────────────

async function dispatchSavedData(
  dataName:    string,
  guildId:     string,
  channel:     any,
  ctx:         PlaceholderContext,
  client:      LevitateClient,
  prependText: string | null = null,
): Promise<void> {
  const entry = await client.db.getSavedData(guildId, dataName).catch((err: unknown): null => {
    webhookLogger.logError(err instanceof Error ? err : new Error(String(err)), 'vanityRoleSender: dispatchSavedData getSavedData lookup');
    return null;
  });
  if (!entry) {
    webhookLogger.logError(new Error(`vanityRoleSender: saved data "${dataName}" not found for guild ${guildId}`), 'vanityRoleSender: dispatchSavedData entry lookup');
    return;
  }

  const storageChannelId: string = (client.config as any).savedDataChannelId ?? '';
  const storageChannel: any = storageChannelId
    ? (client.channels.cache.get(storageChannelId) ??
       await client.channels.fetch(storageChannelId).catch((err: unknown): null => {
         webhookLogger.logError(err instanceof Error ? err : new Error(String(err)), 'vanityRoleSender: dispatchSavedData storage channel fetch');
         return null;
       }))
    : null;
  if (!storageChannel) {
    webhookLogger.logError(new Error('vanityRoleSender: storage channel not configured or unreachable'), 'vanityRoleSender: dispatchSavedData storage channel lookup');
    return;
  }

  const storageMsg: any = await storageChannel.messages
    .fetch(entry.message_id)
    .catch((err: unknown): null => {
      webhookLogger.logError(err instanceof Error ? err : new Error(String(err)), 'vanityRoleSender: dispatchSavedData storage message fetch');
      return null;
    });
  if (!storageMsg) {
    webhookLogger.logError(new Error(`vanityRoleSender: storage message ${entry.message_id} not found`), 'vanityRoleSender: dispatchSavedData storage message lookup');
    return;
  }

  const fileAttachment = storageMsg.attachments?.first?.();
  if (!fileAttachment) {
    webhookLogger.logError(new Error(`vanityRoleSender: storage message ${entry.message_id} has no attachment`), 'vanityRoleSender: dispatchSavedData attachment lookup');
    return;
  }

  let rawContent: string;
  try {
    const res = await fetch(fileAttachment.url);
    if (!res.ok) {
      webhookLogger.logError(new Error(`vanityRoleSender: saved-data fetch failed with status ${res.status}`), 'vanityRoleSender: dispatchSavedData fetch');
      return;
    }
    rawContent = (await res.text()).trim();
  } catch (err) {
    webhookLogger.logError(err instanceof Error ? err : new Error(String(err)), 'vanityRoleSender: dispatchSavedData fetch');
    return;
  }

  if (!rawContent) return;

  const resolved = resolvePlaceholders(rawContent, ctx);

  if (entry.type === 'message') {
    const combined = prependText ? `${prependText}\n${resolved}` : resolved;
    let remaining  = combined;
    while (remaining.length > 0) {
      const chunk = remaining.slice(0, 2000);
      remaining   = remaining.slice(2000);
      await channel.send({
        content:         chunk,
        allowedMentions: { parse: ['users'] },
      }).catch((err: unknown) => {
        webhookLogger.logError(err instanceof Error ? err : new Error(String(err)), 'vanityRoleSender: dispatchSavedData message send');
      });
    }
    return;
  }

  if (entry.type === 'embed') {
    try {
      const parsed = JSON.parse(resolved);
      const embeds = Array.isArray(parsed) ? parsed : (parsed?.embeds ?? [parsed]);
      const payload: any = { embeds, allowedMentions: { parse: ['users'] } };
      if (prependText) {
        payload.content = parsed?.content
          ? `${prependText}\n${parsed.content}`
          : prependText;
      } else if (parsed?.content) {
        payload.content = parsed.content;
      }
      await channel.send(payload).catch((err: unknown) => {
        webhookLogger.logError(err instanceof Error ? err : new Error(String(err)), 'vanityRoleSender: dispatchSavedData embed send');
      });
    } catch (err) {
      webhookLogger.logError(err instanceof Error ? err : new Error(String(err)), 'vanityRoleSender: dispatchSavedData embed parse');
      return;
    }
    return;
  }

  if (entry.type === 'cv2') {
    try {
      const parsed     = JSON.parse(resolved);
      const components = Array.isArray(parsed) ? parsed : [parsed];
      const finalComponents = prependText
        ? [{ type: 10, content: prependText }, ...components]
        : components;
      await channel.send({
        components:      finalComponents,
        flags:           MessageFlags.IsComponentsV2,
        allowedMentions: { parse: ['users'] },
      }).catch((err: unknown) => {
        webhookLogger.logError(err instanceof Error ? err : new Error(String(err)), 'vanityRoleSender: dispatchSavedData cv2 send');
      });
    } catch (err) {
      webhookLogger.logError(err instanceof Error ? err : new Error(String(err)), 'vanityRoleSender: dispatchSavedData cv2 parse');
      return;
    }
  }
}
