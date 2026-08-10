// xoxo/utils/webhookLogger.ts
//
// Queued, rate-limited webhook logger.
// Sends embed-based log messages to the webhook URLs defined in config.webhooks.
// All sends are serialised through a 200ms queue so we never hit Discord's
// webhook rate limit.
//
// WEBHOOK LOGGER EMOJIS
// ---------------------
// Webhooks cannot access emojis from other servers or Application Emojis.
// Define these using markdown from the SAME server the webhook channels
// live in (e.g. '<a:myEmoji:1234567890>').
// Leave as '' to render titles without an emoji prefix.
//
const logEmojis = {
  blackTick:  '<a:blackTick:1495731642965299200>',
  redCross:   '<a:redCross:1495732843983278081>',
  info:       '<a:info:1495732893321007187>',
  blackCross: '<a:black_cross:1493821051459866644>',
};

import { WebhookClient, EmbedBuilder } from 'discord.js';
import config from '../config.js';
import { getHostingProviderName } from '../helpers/getHostingServiceIP.js';

interface QueuedMessage {
  webhookKey: keyof typeof config.webhooks;
  embed:      EmbedBuilder;
}

interface PrefixInfo {
  prefix: string;
  type:   'Native' | 'Global' | 'Slash' | 'NoPrefix';
}

function withEmoji(emoji: string, text: string): string {
  return emoji ? `${emoji} ${text}` : text;
}

class WebhookLogger {
  private static instance: WebhookLogger;
  private webhooks:   Map<string, WebhookClient> = new Map();
  private queue:      QueuedMessage[]            = [];
  private processing  = false;
  private readonly RATE_LIMIT_MS = 200;

  private constructor() {
    this.init();
  }

  static getInstance(): WebhookLogger {
    if (!WebhookLogger.instance) {
      WebhookLogger.instance = new WebhookLogger();
    }
    return WebhookLogger.instance;
  }

  private init(): void {
    for (const [key, url] of Object.entries(config.webhooks)) {
      if (url && typeof url === 'string') {
        try {
          this.webhooks.set(key, new WebhookClient({ url }));
          console.log(`[WEBHOOK] Loaded ${key}`);
        } catch (err: unknown) {
          console.error(`[WEBHOOK] Failed to load ${key}:`, (err as Error).message);
        }
      }
    }
    setInterval(() => this.processQueue(), this.RATE_LIMIT_MS);
  }

  private async processQueue(): Promise<void> {
    if (this.processing || this.queue.length === 0) return;
    this.processing = true;

    const item = this.queue.shift();
    if (item) {
      const webhook = this.webhooks.get(item.webhookKey);
      if (webhook) {
        try {
          await webhook.send({ embeds: [item.embed] });
        } catch (err: unknown) {
          console.error(`[WEBHOOK] Send failed (${item.webhookKey}):`, (err as Error).message);
        }
      }
    }

    this.processing = false;
  }

  private enqueue(key: keyof typeof config.webhooks, embed: EmbedBuilder): void {
    if (!this.webhooks.has(key)) return;
    this.queue.push({ webhookKey: key, embed });
    if (this.queue.length > 30) {
      console.warn(`[WEBHOOK] Queue has ${this.queue.length} pending messages`);
    }
  }

  // ── Public methods ────────────────────────────────────────────────────────

  logReady(client: any): void {
    const hostName: string = getHostingProviderName() || 'Unknown';
    const embed = new EmbedBuilder()
      .setColor(0x2ecc71)
      .setTitle(withEmoji(logEmojis.blackTick, 'Bot Ready'))
      .setDescription(
        `**User:** ${client.user?.tag ?? 'N/A'}\n` +
        `**Guilds:** ${client.guilds.cache.size}\n` +
        `**Cluster:** ${client.cluster?.id?.toString() ?? 'N/A'}\n` +
        `**Host:** ${hostName}`,
      )
      .setTimestamp();
    this.enqueue('readyLog', embed);
  }

  logGuildJoin(guild: any, inviteCode?: string): void {
    const inviteLine = inviteCode && inviteCode !== 'N/A'
      ? `\n**Invite:** https://discord.gg/${inviteCode}`
      : '';
    const embed = new EmbedBuilder()
      .setColor(0x2ecc71)
      .setTitle(withEmoji(logEmojis.blackTick, 'Bot Joined Guild'))
      .setDescription(
        `**Name:** ${guild.name}\n` +
        `**ID:** ${guild.id}\n` +
        `**Members:** ${guild.memberCount?.toString() ?? 'N/A'}\n` +
        `**Owner:** <@${guild.ownerId}>\n` +
        `**Shard:** ${guild.shardId?.toString() ?? 'N/A'}` +
        inviteLine,
      )
      .setThumbnail(guild.iconURL() ?? null)
      .setTimestamp();
    this.enqueue('joinLeave', embed);
  }

  logGuildLeave(guild: any, inviteCode?: string): void {
    const inviteLine = inviteCode && inviteCode !== 'N/A'
      ? `\n**Invite:** https://discord.gg/${inviteCode}`
      : '';
    const embed = new EmbedBuilder()
      .setColor(0xe74c3c)
      .setTitle(withEmoji(logEmojis.redCross, 'Bot Left Guild'))
      .setDescription(
        `**Name:** ${guild.name}\n` +
        `**ID:** ${guild.id}\n` +
        `**Members:** ${guild.memberCount?.toString() ?? 'N/A'}\n` +
        `**Owner:** <@${guild.ownerId}>\n` +
        `**Shard:** ${guild.shardId?.toString() ?? 'N/A'}` +
        inviteLine,
      )
      .setThumbnail(guild.iconURL() ?? null)
      .setTimestamp();
    this.enqueue('joinLeave', embed);
  }

  logCommand(
    commandName: string,
    user:        any,
    guild:       any | null,
    args:        string[] | string,
    prefixInfo?: PrefixInfo,
    messageLink?: string | null,
    channelId?:  string | null,
  ): void {
    const guildLine   = guild ? `${guild.name} (${guild.id})` : 'DM';
    const prefixLine  = prefixInfo
      ? `\n**Prefix:** \`${prefixInfo.prefix}\` (${prefixInfo.type})`
      : '';
    const channelLine = channelId ? `\n**Channel:** <#${channelId}>` : '';
    const jumpLine    = messageLink ? `\n**Message:** [Jump to message](${messageLink})` : '';

    const embed = new EmbedBuilder()
      .setColor(parseInt(config.embedColor.replace('#', ''), 16))
      .setTitle(withEmoji(logEmojis.info, 'Command Executed'))
      .setDescription(
        `**Command:** ${commandName}\n` +
        `**User:** ${user.tag} (${user.id})\n` +
        `**Guild:** ${guildLine}` +
        channelLine +
        prefixLine +
        `\n**Args:** ${Array.isArray(args) ? (args.length ? args.join(' ') : 'None') : (args || 'None')}` +
        jumpLine,
      )
      .setTimestamp();

    this.enqueue('commandLog', embed);
  }

  logShard(event: string, shardId: number, error?: Error): void {
    const isError = event === 'error';
    const desc = [
      `**Shard ID:** ${shardId}`,
      `**Event:** ${event}`,
      ...(error
        ? [
            `**Error:** ${error.message}`,
            `**Stack:**\n\`\`\`${error.stack?.slice(0, 900) ?? 'N/A'}\`\`\``,
          ]
        : []),
    ].join('\n');

    const embed = new EmbedBuilder()
      .setColor(isError ? 0xe74c3c : 0x3498db)
      .setTitle(withEmoji(logEmojis.blackCross, `Shard ${event.charAt(0).toUpperCase() + event.slice(1)}`))
      .setDescription(desc)
      .setTimestamp();

    this.enqueue('shardLog', embed);
  }

  logError(error: Error, context?: string): void {
    const desc = [
      `**Message:** ${error.message}`,
      `**Stack:**\n\`\`\`${error.stack?.slice(0, 900) ?? 'N/A'}\`\`\``,
      ...(context ? [`**Context:** ${context}`] : []),
    ].join('\n');

    const embed = new EmbedBuilder()
      .setColor(0xe74c3c)
      .setTitle(withEmoji(logEmojis.redCross, 'Error Occurred'))
      .setDescription(desc)
      .setTimestamp();

    this.enqueue('errorLog', embed);
  }

  getQueueSize(): number {
    return this.queue.length;
  }
}

export default WebhookLogger.getInstance();
