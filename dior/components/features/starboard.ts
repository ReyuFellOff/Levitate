import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  MessageFlags,
  SeparatorBuilder,
  SeparatorSpacingSize,
  TextDisplayBuilder,
} from 'discord.js';
import type { CassieClient } from '../../structures/CassieClient.js';
import type { StarboardPostDoc, StarboardSettingsDoc } from '../../database/database.js';
import {
  buildActionCancelledPayload,
  buildActionConfirmPayload,
  buildActionTimedOutPayload,
} from '../purgeConfirm.js';
import { clearStarboardPosts, type ClearStarboardResult } from '../../helpers/starboard.js';

const TIMEOUT_MS = 10 * 60_000;
const sessions = new Map<string, { guildId: string; channelId: string; client: CassieClient }>();
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
  session: { guildId: string; channelId: string; client: CassieClient },
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
        new ButtonBuilder()
          .setCustomId('sb:clear')
          .setLabel('Clear Messages')
          .setStyle(ButtonStyle.Danger)
          .setDisabled(disabled),
      ),
    );

  return wrap(container);
}

const STARBOARD_CLEAR_TITLE = 'Clear Starboard Messages';

function starboardClearDescription(count: number): string {
  return [
    `This will permanently delete **${count}** tracked starboard message${count === 1 ? '' : 's'} and remove their records from the database.`,
    '',
    '**Original source messages and their reactions will not be deleted.**',
    '**This action is irreversible.**',
  ].join('\n');
}

export function buildStarboardClearConfirmPayload(confirmId: string, cancelId: string, count: number): any {
  return buildActionConfirmPayload(
    confirmId,
    cancelId,
    STARBOARD_CLEAR_TITLE,
    starboardClearDescription(count),
  );
}

export function buildStarboardClearTimedOutPayload(confirmId: string, cancelId: string, count: number): any {
  return buildActionTimedOutPayload(
    confirmId,
    cancelId,
    STARBOARD_CLEAR_TITLE,
    starboardClearDescription(count),
  );
}

export function buildStarboardClearCancelledPayload(confirmId: string, cancelId: string, count: number): any {
  return buildActionCancelledPayload(
    confirmId,
    cancelId,
    STARBOARD_CLEAR_TITLE,
    starboardClearDescription(count),
  );
}

export function buildStarboardClearResultPayload(result: ClearStarboardResult): any {
  const failureLine = result.messagesNotDeleted > 0
    ? `\n-# ${result.messagesNotDeleted} board message${result.messagesNotDeleted === 1 ? '' : 's'} could not be deleted, but the database records were cleared.`
    : '';
  return wrap(new ContainerBuilder()
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(
      `## Starboard Cleared\n\nDeleted **${result.messagesDeleted}** board message${result.messagesDeleted === 1 ? '' : 's'} and removed **${result.recordsDeleted}** database record${result.recordsDeleted === 1 ? '' : 's'}.${failureLine}`,
    )));
}

export function buildStarboardClearErrorPayload(): any {
  return wrap(new ContainerBuilder()
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(
      '## Starboard Clear Failed\n\nNothing was removed because the clear operation could not be completed.',
    )));
}

function safeText(value: string, max: number): string {
  const clean = value.replace(/@everyone|@here/g, '@\u200b$&');
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max - 1)}…`;
}

function quoteText(value: string): string {
  const clean = safeText(value, 4_000);
  if (!clean) return '> *No text content*';
  return clean.split('\n').map((line) => `> ${line || ' '}`).join('\n');
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
  const body = post.message_content.startsWith('↪ ')
    ? (() => {
      const replyBreak = post.message_content.indexOf('\n\n');
      return (replyBreak >= 0 ? post.message_content.slice(replyBreak + 2) : post.message_content).trim();
    })()
    : post.message_content.trim();
  const timestamp = Math.floor(new Date(post.source_created_at).getTime() / 1000);
  const relativeTime = Number.isFinite(timestamp) ? `<t:${timestamp}:R>` : 'just now';
  const authorContent = [
    `**${safeText(post.author_name, 100)}** <@${post.author_id}>`,
    quoteText(body),
  ].join('\n');
  const footerContent = [
    hiddenMedia ? '-# Media preview hidden because the starboard channel is not NSFW.' : '',
    `-# Posted in <#${post.source_channel_id}> at ${relativeTime}`,
  ].filter(Boolean).join('\n');

  const container = new ContainerBuilder()
    .setAccentColor(settings?.color ?? 0xFEE75C)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `## ${post.star_count} star${post.star_count === 1 ? '' : 's'} ${settings?.emoji ?? '⭐'}`,
      ),
    )
    .addSeparatorComponents(
      new SeparatorBuilder()
        .setSpacing(SeparatorSpacingSize.Small)
        .setDivider(true),
    )
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(authorContent));

  if (visibleAttachments.length) {
    container.addMediaGalleryComponents(
      new MediaGalleryBuilder().addItems(
        ...visibleAttachments.slice(0, 10).map((url) => new MediaGalleryItemBuilder().setURL(url)),
      ),
    );
  }

  container
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(`\n${footerContent}`))
    .addSeparatorComponents(
      new SeparatorBuilder()
        .setSpacing(SeparatorSpacingSize.Small)
        .setDivider(true),
    )
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

export async function handleStarboardInteraction(interaction: any, client: CassieClient): Promise<void> {
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
  if (raw === 'sb:clear') {
    const count = await client.db.countStarboardPosts(session.guildId);
    if (count === 0) {
      await interaction.reply({
        content: 'There are no tracked starboard messages to clear.',
        flags: MessageFlags.Ephemeral,
      }).catch((): null => null);
      return;
    }
    await interaction.update(buildStarboardClearConfirmPayload(
      `sb:clear-confirm:${interaction.message.id}`,
      `sb:clear-cancel:${interaction.message.id}`,
      count,
    ));
    return;
  }
  if (raw === `sb:clear-cancel:${interaction.message.id}`) {
    await interaction.update(buildConfigPanel(settings, client.config.prefix));
    return;
  }
  if (raw === `sb:clear-confirm:${interaction.message.id}`) {
    await interaction.deferUpdate().catch((): null => null);
    try {
      const result = await clearStarboardPosts(client, session.guildId);
      await interaction.editReply(buildStarboardClearResultPayload(result)).catch((): null => null);
    } catch (error: unknown) {
      console.error(`[starboard] Clear failed for guild ${session.guildId}: ${error instanceof Error ? error.message : String(error)}`);
      await interaction.editReply(buildStarboardClearErrorPayload()).catch((): null => null);
    }
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