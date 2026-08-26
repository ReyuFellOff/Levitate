// xoxo/components/serverlist.ts
//
// CV2 builders, session tracking, and interaction handlers for $serverlist.
//
// Two views:
//   List   — numbered server roster + StringSelectMenu to pick a server.
//   Detail — server icon, full info, and a ← Back button.
//
// customId routing (interactionCreate.ts):
//   StringSelectMenu → 'serverlist:select'
//   Button           → 'serverlist:back' | 'serverlist:prev' | 'serverlist:next'

import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  MessageFlags,
  SeparatorBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  TextDisplayBuilder,
} from 'discord.js';
import type { CassieClient } from '../../structures/CassieClient.js';
import { ensureGuildInvite, NO_INVITE } from '../../helpers/inviteCache.js';
import { emojis } from '../../emojis.js';
import config from '../../config.js';

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const INACTIVITY_MS = 5 * 60 * 1_000;
const PAGE_SIZE     = 25;
const EMBED_COLOR   = parseInt(config.embedColor.replace('#', ''), 16);

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface ServerListSession {
  userId:    string;
  channelId: string;
  guildIds:  string[]; // sorted by memberCount desc
  page:      number;
  client:    CassieClient;
}

// ─────────────────────────────────────────────────────────────────────────────
// Session tracking
// ─────────────────────────────────────────────────────────────────────────────

export const serverListSessions = new Map<string, ServerListSession>();
const serverListTimeouts         = new Map<string, NodeJS.Timeout>();

export function registerServerListSession(messageId: string, session: ServerListSession): void {
  serverListSessions.set(messageId, session);
  resetServerListTimeout(messageId);
}

export function resetServerListTimeout(messageId: string): void {
  const session = serverListSessions.get(messageId);
  if (!session) return;

  clearTimeout(serverListTimeouts.get(messageId));

  const timeout = setTimeout(async () => {
    try {
      const channel = await session.client.channels.fetch(session.channelId);
      const msg     = await (channel as any).messages.fetch(messageId);
      await msg.edit(buildServerListPayload(session.guildIds, session.client, session.page, true));
    } catch {
      // Message deleted or inaccessible
    } finally {
      serverListSessions.delete(messageId);
      serverListTimeouts.delete(messageId);
    }
  }, INACTIVITY_MS);

  serverListTimeouts.set(messageId, timeout);
}

// ─────────────────────────────────────────────────────────────────────────────
// List view payload
// ─────────────────────────────────────────────────────────────────────────────

export function buildServerListPayload(
  guildIds:  string[],
  client:    CassieClient,
  page     = 0,
  disabled = false,
): any {
  const totalPages = Math.max(1, Math.ceil(guildIds.length / PAGE_SIZE));
  const safePage   = Math.min(Math.max(page, 0), totalPages - 1);
  const pageIds    = guildIds.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);
  const offset     = safePage * PAGE_SIZE;

  const guilds = pageIds.map(id => client.guilds.cache.get(id)).filter(Boolean) as any[];

  // Numbered text list — names only
  const listLines = guilds.map((g: any, i: number) =>
    `**${offset + i + 1}.** ${g.name}`,
  );

  // Select menu options
  const selectOptions = guilds.map((g: any) =>
    new StringSelectMenuOptionBuilder()
      .setValue(g.id)
      .setLabel(g.name.length > 100 ? g.name.slice(0, 97) + '…' : g.name)
      .setDescription(`${(g.memberCount ?? 0).toLocaleString()} members · ${g.id}`),
  );

  const menu = new StringSelectMenuBuilder()
    .setCustomId('serverlist:select')
    .setPlaceholder('Choose a server to view details…')
    .addOptions(selectOptions)
    .setDisabled(disabled || selectOptions.length === 0);

  const prevBtn = new ButtonBuilder()
    .setCustomId('serverlist:prev')
    .setLabel('← Prev')
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(disabled || safePage === 0);

  const nextBtn = new ButtonBuilder()
    .setCustomId('serverlist:next')
    .setLabel('Next →')
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(disabled || safePage >= totalPages - 1);

  const pageBtn = new ButtonBuilder()
    .setCustomId('serverlist:noop')
    .setLabel(`${safePage + 1} / ${totalPages}`)
    .setStyle(ButtonStyle.Primary)
    .setDisabled(true);

  const footerText = disabled
    ? '-# This session has timed out. Run `$serverlist` again.'
    : `-# ${guildIds.length} server${guildIds.length === 1 ? '' : 's'} total. Select one to view its details.`;

  const container = new ContainerBuilder().setAccentColor(parseInt(config.defaultAccentColor.replace('#', ''), 16))
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`## ${emojis.blackflower} Bot Servers (${guildIds.length})`),
    )
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(listLines.join('\n') || 'No servers.'),
    )
    .addActionRowComponents(
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu) as any,
    );

  if (totalPages > 1) {
    container.addActionRowComponents(
      new ActionRowBuilder<ButtonBuilder>().addComponents(prevBtn, pageBtn, nextBtn),
    );
  }

  container.addSeparatorComponents(new SeparatorBuilder().setDivider(true))
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(footerText),
    );

  return {
    components:      [container],
    flags:           MessageFlags.IsComponentsV2,
    allowedMentions: { parse: [] },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Detail view payload
// ─────────────────────────────────────────────────────────────────────────────

export function buildServerDetailPayload(
  guild:      any,
  inviteCode: string,
  loading   = false,
): any {
  const inviteUrl = inviteCode !== NO_INVITE
    ? `https://discord.gg/${inviteCode}`
    : null;

  const createdAt = guild.createdAt
    ? `<t:${Math.floor(guild.createdAt.getTime() / 1000)}:D>`
    : 'Unknown';

  const infoLines = loading
    ? `**ID:** ${guild.id}\n**Members:** ${(guild.memberCount ?? 0).toLocaleString()}\n**Owner:** <@${guild.ownerId}>\n**Created:** ${createdAt}\n**Invite:** *Generating…*`
    : `**ID:** ${guild.id}\n**Members:** ${(guild.memberCount ?? 0).toLocaleString()}\n**Owner:** <@${guild.ownerId}>\n**Created:** ${createdAt}\n**Invite:** ${inviteUrl ? `discord.gg/${inviteCode}` : 'N/A'}`;

  const backBtn = new ButtonBuilder()
    .setCustomId('serverlist:back')
    .setLabel('← Back')
    .setStyle(ButtonStyle.Secondary);

  const iconUrl = guild.iconURL({ size: 512, extension: 'png' }) ?? null;

  const container = new ContainerBuilder().setAccentColor(parseInt(config.defaultAccentColor.replace('#', ''), 16))
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`## ${guild.name}`),
    )
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true));

  if (iconUrl) {
    container.addMediaGalleryComponents(
      new MediaGalleryBuilder().addItems(
        new MediaGalleryItemBuilder().setURL(iconUrl).setDescription(guild.name),
      ),
    );
    container.addSeparatorComponents(new SeparatorBuilder().setDivider(true));
  }

  container
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(infoLines),
    )
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true));

  // Build button row: Back always shown; Join (link) only when invite exists
  const buttons: ButtonBuilder[] = [backBtn];
  if (inviteUrl && !loading) {
    buttons.push(
      new ButtonBuilder()
        .setURL(inviteUrl)
        .setLabel('Join Server')
        .setStyle(ButtonStyle.Link),
    );
  }

  container.addActionRowComponents(
    new ActionRowBuilder<ButtonBuilder>().addComponents(...buttons),
  );

  return {
    components:      [container],
    flags:           MessageFlags.IsComponentsV2,
    allowedMentions: { parse: [] },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Interaction handlers
// ─────────────────────────────────────────────────────────────────────────────

function resolveSession(interaction: any): { session: ServerListSession; messageId: string } | null {
  const messageId: string = interaction.message?.id ?? '';
  const session = serverListSessions.get(messageId);
  if (!session) return null;
  return { session, messageId };
}

export async function handleServerListSelect(interaction: any, client: CassieClient): Promise<void> {
  const resolved = resolveSession(interaction);
  if (!resolved) {
    await interaction.reply({ content: 'This session has expired. Run `$serverlist` again.', flags: MessageFlags.Ephemeral })
      .catch((): null => null);
    return;
  }

  if (interaction.user.id !== resolved.session.userId) {
    await interaction.reply({ content: 'This menu belongs to someone else.', flags: MessageFlags.Ephemeral })
      .catch((): null => null);
    return;
  }

  const guildId: string = interaction.values[0] as string;
  const guild = client.guilds.cache.get(guildId);
  if (!guild) {
    await interaction.reply({ content: 'Could not find that server (may have been left).', flags: MessageFlags.Ephemeral })
      .catch((): null => null);
    return;
  }

  // Show loading state immediately, then fill in the invite.
  await interaction.update(buildServerDetailPayload(guild, NO_INVITE, true));

  let inviteCode = NO_INVITE;
  try {
    inviteCode = await ensureGuildInvite(client, guild);
  } catch {
    inviteCode = NO_INVITE;
  }

  try {
    await interaction.message.edit(buildServerDetailPayload(guild, inviteCode, false));
  } catch {
    // If edit fails, leave the loading state
  }

  resetServerListTimeout(resolved.messageId);
}

export async function handleServerListBack(interaction: any, client: CassieClient): Promise<void> {
  const resolved = resolveSession(interaction);
  if (!resolved) {
    await interaction.reply({ content: 'This session has expired. Run `$serverlist` again.', flags: MessageFlags.Ephemeral })
      .catch((): null => null);
    return;
  }

  if (interaction.user.id !== resolved.session.userId) {
    await interaction.reply({ content: 'This menu belongs to someone else.', flags: MessageFlags.Ephemeral })
      .catch((): null => null);
    return;
  }

  await interaction.update(
    buildServerListPayload(resolved.session.guildIds, client, resolved.session.page),
  );
  resetServerListTimeout(resolved.messageId);
}

export async function handleServerListPage(interaction: any, client: CassieClient, delta: number): Promise<void> {
  const resolved = resolveSession(interaction);
  if (!resolved) {
    await interaction.reply({ content: 'This session has expired. Run `$serverlist` again.', flags: MessageFlags.Ephemeral })
      .catch((): null => null);
    return;
  }

  if (interaction.user.id !== resolved.session.userId) {
    await interaction.reply({ content: 'This menu belongs to someone else.', flags: MessageFlags.Ephemeral })
      .catch((): null => null);
    return;
  }

  const totalPages = Math.max(1, Math.ceil(resolved.session.guildIds.length / PAGE_SIZE));
  const newPage    = Math.min(Math.max(resolved.session.page + delta, 0), totalPages - 1);
  resolved.session.page = newPage;

  await interaction.update(
    buildServerListPayload(resolved.session.guildIds, client, newPage),
  );
  resetServerListTimeout(resolved.messageId);
}
