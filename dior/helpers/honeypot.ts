import type { CassieClient } from '../structures/CassieClient.js';
import { emojis } from '../emojis.js';
import { config } from '../config.js';
import { ContainerBuilder, MessageFlags, TextDisplayBuilder } from 'discord.js';
import { defaultHoneypotWarning } from '../components/features/honeypot.js';

const activeModerations = new Set<string>();
const settingsCache = new Map<string, { expiresAt: number; channelId: string | null; enabled: boolean }>();
const CACHE_TTL_MS = 10_000;

export function invalidateHoneypotCache(guildId: string): void {
  settingsCache.delete(guildId);
}

export async function enforceHoneypot(message: any, client: CassieClient): Promise<boolean> {
  if (!message.guild || !client.db || message.author?.bot) return false;

  const guildId = message.guild.id;
  const settings = await getCachedSettings(client, guildId);
  if (!settings.enabled || !settings.channelId || settings.channelId !== (message.channelId ?? message.channel?.id)) return false;

  const userId = message.author.id;
  const moderationKey = `${guildId}:${userId}`;
  if (activeModerations.has(moderationKey)) return true;
  activeModerations.add(moderationKey);

  try {
    const member = message.member ?? await message.guild.members.fetch(userId).catch((): null => null);
    if (member?.id === message.guild.ownerId || member?.permissions?.has?.('Administrator')) return false;

    await message.delete().catch((): null => null);
    const current = await client.db.getHoneypotSettings(guildId).catch((): null => null);
    if (!current?.enabled || current.channel_id !== settings.channelId) return true;

    const action = current.action === 'ban' ? 'ban' : 'kick';
    await message.author.send({
      components: [new ContainerBuilder()
        .setAccentColor(parseInt(config.defaultAccentColor.replace('#', ''), 16))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(
          `## ${emojis.honeypotTrap} You have been ${action === 'ban' ? 'banned' : 'kicked'} from **${message.guild.name}**\n` +
          '**Reason:** You sent a message in the honeypot channel.',
        ))],
      flags: MessageFlags.IsComponentsV2,
    }).catch((): null => null);
    if (action === 'ban') {
      await message.guild.members.ban(userId, {
        deleteMessageSeconds: 3600,
        reason: 'Triggered honeypot channel',
      });
    } else {
      await message.guild.members.kick(userId, 'Triggered honeypot channel');
    }

    const moderatedCount = (current.moderated_count ?? 0) + 1;
    await client.db.setHoneypotSettings(guildId, { moderated_count: moderatedCount });
    const warningChannel: any = await client.channels.fetch(current.channel_id).catch((): null => null);
    const warningMessage: any = warningChannel?.messages && current.warning_message_id
      ? await warningChannel.messages.fetch(current.warning_message_id).catch((): null => null)
      : null;
    await warningMessage?.edit(defaultHoneypotWarning(action, moderatedCount)).catch((): null => null);

    if (current.log_channel_id) {
      const logChannel = await client.channels.fetch(current.log_channel_id).catch((): null => null);
      if (logChannel && 'send' in logChannel && typeof (logChannel as any).send === 'function') {
        await (logChannel as any).send({
          content: `${emojis.honeypotTrap} Honeypot ${action}: **${message.author.tag ?? message.author.username}** (<@${userId}>) in <#${settings.channelId}>.`,
          allowedMentions: { parse: [] },
        }).catch((): null => null);
      }
    }
  } catch (error: unknown) {
    console.error(`[honeypot] Failed to moderate ${userId}:`, error);
  } finally {
    activeModerations.delete(moderationKey);
  }

  return true;
}

async function getCachedSettings(client: CassieClient, guildId: string) {
  const cached = settingsCache.get(guildId);
  if (cached && cached.expiresAt > Date.now()) return cached;

  const stored = await client.db!.getHoneypotSettings(guildId).catch((): null => null);
  const value = {
    expiresAt: Date.now() + CACHE_TTL_MS,
    channelId: stored?.channel_id ?? null,
    enabled: stored?.enabled ?? false,
  };
  settingsCache.set(guildId, value);
  return value;
}