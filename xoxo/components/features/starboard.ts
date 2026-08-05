import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  MessageFlags,
  SeparatorBuilder,
  TextDisplayBuilder,
} from 'discord.js';
import type { LevitateClient } from '../../structures/LevitateClient.js';
import type { StarboardPostDoc, StarboardSettingsDoc } from '../../database/database.js';
import { formatClock } from '../../utils/formatting.js';

const TIMEOUT_MS = 10 * 60_000;
const sessions = new Map<string, { guildId: string; channelId: string; client: LevitateClient }>();
const timeouts = new Map<string, NodeJS.Timeout>();

export function wrap(container: ContainerBuilder): any {
  return {
    components: [container],
    flags: MessageFlags.IsComponentsV2,
    allowedMentions: { parse: [] },
  };
}

export function registerStarboardSession(
  messageId: string,
  session: { guildId: string; channelId: string; client: LevitateClient },
): void {
  sessions.set(messageId, session);
  clearTimeout(timeouts.get(messageId));
  timeouts.set(messageId, setTimeout(() => {
    sessions.delete(messageId);
    timeouts.delete(messageId);
  }, TIMEOUT_MS));
}

function status(settings: StarboardSettingsDoc | null): string {
  if (!settings?.channel_id) return 'Not configured';
  return settings.enabled === false ? 'Disabled' : 'Enabled';
}

function channelLine(settings: StarboardSettingsDoc | null): string {
  return settings?.channel_id ? `<#${settings.channel_id}>` : 'Not set';
}

function colorHex(color: number | undefined): string {
  return `#${(color ?? 0xFEE75C).toString(16).padStart(6, '0').toUpperCase()}`;
}

export function buildConfigPanel(
  settings: StarboardSettingsDoc | null,
  prefix: string,
  disabled = false,
): any {
  const ignoredChannels = settings?.ignored_channel_ids?.length ?? 0;
  const ignoredRoles = settings?.ignored_role_ids?.length ?? 0;
  const enabled = settings?.enabled !== false;
  const ignoredChannelLine = ignoredChannels
    ? `\n**Ignored channels:** ${settings!.ignored_channel_ids.map((id) => `<#${id}>`).join(', ')}`
    : '';
  const ignoredRoleLine = ignoredRoles
    ? `\n**Ignored roles:** ${settings!.ignored_role_ids.map((id) => `<@&${id}>`).join(', ')}`
    : '';
  const content = [
    '## Starboard',
    '',
    `**Status:** ${status(settings)}`,
    `**Channel:** ${channelLine(settings)}`,
    `**Threshold:** ${settings?.threshold ?? 3} ${settings?.emoji ?? '⭐'}`,
    `**Accent:** \`${colorHex(settings?.color)}\``,
    `**Ignored:** ${ignoredChannels} channel${ignoredChannels === 1 ? '' : 's'}, ${ignoredRoles} role${ignoredRoles === 1 ? '' : 's'}${ignoredChannelLine}${ignoredRoleLine}`,
    '',
    `-# Use \`${prefix}starboard channel <#channel>\` to choose the destination.`,
    `-# Use \`${prefix}starboard ignore add <#channel|@role>\` to exclude content.`,
  ].join('\n');

  const container = new ContainerBuilder()
    .setAccentColor(settings?.color ?? 0xFEE75C)
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(content))
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
    .addActionRowComponents(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(`sb:toggle:${enabled ? 'off' : 'on'}`)
          .setLabel(enabled ? 'Disable' : 'Enable')
          .setStyle(enabled ? ButtonStyle.Danger : ButtonStyle.Success)
          .setDisabled(disabled),
        new ButtonBuilder()
          .setCustomId('sb:refresh')
          .setLabel('Refresh')
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(disabled),
      ),
    );

  return wrap(container);
}

function tier(count: number): string {
  if (count >= 25) return '💫';
  if (count >= 10) return '✨';
  if (count >= 5) return '🌟';
  return '⭐';
}

function safeText(value: string, max: number): string {
  const clean = value.replace(/@everyone|@here/g, '@\u200b$&');
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max - 1)}…`;
}

function isImage(url: string): boolean {
  return /\.(?:png|jpe?g|gif|webp|bmp)(?:\?.*)?$/i.test(url);
}

export function buildStarboardPost(
  post: StarboardPostDoc,
  targetIsNsfw: boolean,
  settings: StarboardSettingsDoc | null,
): any {
  const visibleAttachments = targetIsNsfw || !post.source_nsfw
    ? post.attachment_urls
    : [];
  const hiddenMedia = !targetIsNsfw && post.source_nsfw && post.attachment_urls.length > 0;
  const replyLine = post.message_content.startsWith('↪ ')
    ? post.message_content.slice(0, post.message_content.indexOf('\n\n'))
    : '';
  const body = post.message_content.replace(replyLine, '').trim();
  const content = [
    `## ${tier(post.star_count)} ${post.star_count} star${post.star_count === 1 ? '' : 's'}`,
    `**${safeText(post.author_name, 100)}** <@${post.author_id}>`,
    replyLine,
    body || '*No text content*',
    hiddenMedia ? '\n-# Media preview hidden because the starboard channel is not NSFW.' : '',
    `\n-# Posted in <#${post.source_channel_id}> at ${formatClock(new Date(post.source_created_at))}`,
  ].filter(Boolean).join('\n');

  const container = new ContainerBuilder()
    .setAccentColor(settings?.color ?? 0xFEE75C)
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(content));

  if (visibleAttachments.length) {
    container.addMediaGalleryComponents(
      new MediaGalleryBuilder().addItems(
        ...visibleAttachments.slice(0, 10).map((url) => new MediaGalleryItemBuilder().setURL(url)),
      ),
    );
  }

  container
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
    .addActionRowComponents(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setLabel('Jump to Message')
          .setStyle(ButtonStyle.Link)
          .setURL(post.source_message_url),
      ),
    );

  return wrap(container);
}

export async function handleStarboardInteraction(interaction: any, client: LevitateClient): Promise<void> {
  const raw = String(interaction.customId);
  const session = sessions.get(interaction.message?.id);
  if (!session || session.guildId !== interaction.guild?.id) {
    await interaction.reply({ content: 'This panel has expired. Run the command again.', flags: MessageFlags.Ephemeral }).catch((): null => null);
    return;
  }
  if (!interaction.member?.permissions?.has?.('ManageGuild')) {
    await interaction.reply({ content: 'You need the Manage Server permission to use this panel.', flags: MessageFlags.Ephemeral }).catch((): null => null);
    return;
  }

  const settings = await client.db.getStarboardSettings(session.guildId);
  if (raw === 'sb:refresh') {
    await interaction.update(buildConfigPanel(settings, client.config.prefix));
    return;
  }
  if (raw.startsWith('sb:toggle:')) {
    const enabled = raw.endsWith(':on');
    await client.db.setStarboardSettings(session.guildId, { enabled });
    await interaction.update(buildConfigPanel(
      await client.db.getStarboardSettings(session.guildId),
      client.config.prefix,
    ));
  }
}

export function getStarboardSession(messageId: string): boolean {
  return sessions.has(messageId);
}