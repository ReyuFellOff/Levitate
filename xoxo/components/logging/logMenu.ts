// xoxo/components/logging/logMenu.ts
//
// CV2 payloads + interaction handling for the $log / $logs / $logging
// configuration command.
//
// Pages:
//   • Home        — dropdown listing: All, Channel, Member, Role, VC, Message, Server
//   • "all" page  — single channel select only (no exceptions; sends every event here)
//   • category    — channel select (where logs for this category are sent) +
//                    an exceptions select (type depends on the category)
//
// All interactions are routed here from `interactionCreate.ts` via
// `handleLogConfigInteraction`, regardless of component type (button, string
// select, channel select, role select, user select) — this file inspects the
// interaction itself to decide what to do.
//
// Permission: every interaction re-checks `ManageGuild` on the invoking
// member (not just the original invoker) since this is a shared, persistent
// guild config panel — not a single-user ephemeral session.

import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelSelectMenuBuilder,
  ChannelType,
  ContainerBuilder,
  MessageFlags,
  parseEmoji,
  PermissionFlagsBits,
  RoleSelectMenuBuilder,
  SeparatorBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  TextDisplayBuilder,
  UserSelectMenuBuilder,
} from 'discord.js';
import type { LevitateClient } from '../../structures/LevitateClient.js';
import type { LogCategoryKey, LogConfigDoc } from '../../database/database.js';
import { logCategories, serverLogEventTypeOptions, getLogCategoryInfo } from '../../config/logCategories.js';
import { emojis } from '../../emojis.js';

/** Converts one of our `<a:name:id>` emoji strings into a button-compatible emoji object. */
// function toButtonEmoji(emojiString: string): { id: string; name: string; animated: boolean } | undefined {
//   const parsed = parseEmoji(emojiString);
//   if (!parsed?.id || !parsed.name) return undefined;
//   return { id: parsed.id, name: parsed.name, animated: !!parsed.animated };
// }

const CHANNEL_SEARCH_HINT = '-# Can\'t see your channel? Click the box and type its name to search — the list only shows a few at first.';

const INACTIVITY_MS = 5 * 60 * 1000; // 5 minutes

// ─────────────────────────────────────────────────────────────────────────────
// Session tracking (mirrors the pattern used by helpMenu.ts) — purely used to
// auto-disable a stale panel's components; permission is re-checked live on
// every interaction regardless of session state.
// ─────────────────────────────────────────────────────────────────────────────

interface LogMenuSession {
  page: 'home' | 'all' | LogCategoryKey;
  guildId: string;
  channelId: string;
  client: LevitateClient;
}

const logMenuSessions = new Map<string, LogMenuSession>();
const logMenuTimeouts = new Map<string, NodeJS.Timeout>();

export function registerLogMenuSession(messageId: string, session: LogMenuSession): void {
  logMenuSessions.set(messageId, session);
  resetLogMenuTimeout(messageId);
}

function resetLogMenuTimeout(messageId: string): void {
  const session = logMenuSessions.get(messageId);
  if (!session) return;

  clearTimeout(logMenuTimeouts.get(messageId));

  const timeout = setTimeout(async () => {
    try {
      const channel = await session.client.channels.fetch(session.channelId);
      const message = await (channel as any).messages.fetch(messageId);
      const payload = await buildPageByName(session.client, session.guildId, session.page, true);
      await message.edit(payload);
    } catch {
      // Message deleted or inaccessible — ignore.
    } finally {
      logMenuSessions.delete(messageId);
      logMenuTimeouts.delete(messageId);
    }
  }, INACTIVITY_MS);

  logMenuTimeouts.set(messageId, timeout);
}

async function buildPageByName(
  client: LevitateClient,
  guildId: string,
  page: 'home' | 'all' | LogCategoryKey,
  disabled: boolean,
) {
  if (page === 'home') return buildLogHomePayload(client, guildId, disabled);
  if (page === 'all') return buildLogAllPayload(client, guildId, disabled);
  return buildLogCategoryPayload(client, guildId, page, disabled);
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared UI pieces
// ─────────────────────────────────────────────────────────────────────────────

function buildHomeButtonRow(disabled = false): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setLabel('Home')
      .setStyle(ButtonStyle.Secondary)
      .setCustomId('logcfg:home')
      .setDisabled(disabled),
  );
}

function buildToggleAndHomeRow(
  target: 'all' | LogCategoryKey,
  enabled: boolean,
  disabled = false,
): ActionRowBuilder<ButtonBuilder> {
  const toggleButton = new ButtonBuilder()
    .setLabel(enabled ? 'Disable' : 'Enable')
    .setStyle(enabled ? ButtonStyle.Danger : ButtonStyle.Success)
    .setCustomId(`logcfg:toggle:${target}`)
    .setDisabled(disabled);

  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    toggleButton,
    new ButtonBuilder()
      .setLabel('Home')
      .setStyle(ButtonStyle.Secondary)
      .setCustomId('logcfg:home')
      .setDisabled(disabled),
  );
}

function channelLabel(channelId: string | null): string {
  return channelId ? `<#${channelId}>` : '*Not set*';
}

// ─────────────────────────────────────────────────────────────────────────────
// Home page
// ─────────────────────────────────────────────────────────────────────────────

export async function buildLogHomePayload(
  client: LevitateClient,
  guildId: string,
  disabled = false,
) {
  const cfg = client.db ? await client.db.getLogConfig(guildId).catch((): null => null) : null;

  const options = [
    new StringSelectMenuOptionBuilder()
      .setValue('all')
      .setLabel('All')
      .setDescription('Send every single log event to one channel — no exceptions.'),
    ...logCategories.map((cat) =>
      new StringSelectMenuOptionBuilder()
        .setValue(cat.key)
        .setLabel(cat.label)
        .setDescription(cat.description.slice(0, 100)),
    ),
  ];

  const menu = new StringSelectMenuBuilder()
    .setCustomId('logcfg:nav')
    .setPlaceholder('Choose a log category to configure…')
    .addOptions(options)
    .setDisabled(disabled);

  const statusIcon = (enabled: boolean | undefined) => (enabled === false ? `${emojis.redcross} Disabled` : `${emojis.greenTick} Enabled`);

  const statusLines = [
    `${emojis.whiteArrow2} **All** — ${channelLabel(cfg?.all_channel_id ?? null)} · ${statusIcon(cfg?.all_enabled)}`,
    ...logCategories.map((cat) => {
      const catCfg = cfg?.[cat.key];
      const exCount = catCfg?.exceptions.length ?? 0;
      return `${emojis.whiteArrow2} **${cat.label}** — ${channelLabel(catCfg?.channel_id ?? null)} · ${statusIcon(catCfg?.enabled)}${exCount ? ` (${exCount} exception${exCount === 1 ? '' : 's'})` : ''}`;
    }),
  ];

  const container = new ContainerBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`## ${emojis.clock} Logging Configuration`),
    )
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        'Pick a category below to set its log channel and exceptions.\n\n' + statusLines.join('\n'),
      ),
    )
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
    .addActionRowComponents(new ActionRowBuilder().addComponents(menu) as any);

  return {
    components: [container],
    flags: MessageFlags.IsComponentsV2,
    allowedMentions: { parse: [] as string[] },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// "All" page — single channel select, no exceptions
// ─────────────────────────────────────────────────────────────────────────────

export async function buildLogAllPayload(
  client: LevitateClient,
  guildId: string,
  disabled = false,
) {
  const cfg = client.db ? await client.db.getLogConfig(guildId).catch((): null => null) : null;

  const channelSelect = new ChannelSelectMenuBuilder()
    .setCustomId('logcfg:setchannel:all')
    .setPlaceholder('Select the channel for ALL logs…')
    .setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
    .setMinValues(1)
    .setMaxValues(1)
    .setDisabled(disabled);

  const enabled = cfg?.all_enabled ?? true;

  const container = new ContainerBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`## ${emojis.clock} All Logs`),
    )
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `Every single log event (channel, member, role, vc, message, server) will be sent to one channel. Exceptions do not apply here.\n\n` +
        `${emojis.whiteArrow2} **Current channel:** ${channelLabel(cfg?.all_channel_id ?? null)}\n` +
        `${emojis.whiteArrow2} **Status:** ${enabled ? `${emojis.greenTick} Enabled` : `${emojis.redcross} Disabled`}`,
      ),
    )
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
    .addActionRowComponents(new ActionRowBuilder().addComponents(channelSelect) as any)
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(CHANNEL_SEARCH_HINT))
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
    .addActionRowComponents(buildToggleAndHomeRow('all', enabled, disabled));

  return {
    components: [container],
    flags: MessageFlags.IsComponentsV2,
    allowedMentions: { parse: [] as string[] },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Category page — channel select + exceptions select
// ─────────────────────────────────────────────────────────────────────────────

function buildExceptionsRow(category: LogCategoryKey, cfg: LogConfigDoc | null, disabled: boolean): ActionRowBuilder {
  const info = getLogCategoryInfo(category)!;
  const current = cfg?.[category]?.exceptions ?? [];

  if (info.exceptionKind === 'channel' || info.exceptionKind === 'voiceChannel') {
    const select = new ChannelSelectMenuBuilder()
      .setCustomId(`logcfg:setexceptions:${category}`)
      .setPlaceholder(info.exceptionLabel)
      .setMinValues(0)
      .setMaxValues(25)
      .setDisabled(disabled);
    if (info.exceptionKind === 'voiceChannel') {
      select.setChannelTypes(ChannelType.GuildVoice, ChannelType.GuildStageVoice);
    }
    if (current.length) select.setDefaultChannels(...current.slice(0, 25));
    return new ActionRowBuilder().addComponents(select);
  }

  if (info.exceptionKind === 'role') {
    const select = new RoleSelectMenuBuilder()
      .setCustomId(`logcfg:setexceptions:${category}`)
      .setPlaceholder(info.exceptionLabel)
      .setMinValues(0)
      .setMaxValues(25)
      .setDisabled(disabled);
    if (current.length) select.setDefaultRoles(...current.slice(0, 25));
    return new ActionRowBuilder().addComponents(select);
  }

  if (info.exceptionKind === 'user') {
    const select = new UserSelectMenuBuilder()
      .setCustomId(`logcfg:setexceptions:${category}`)
      .setPlaceholder(info.exceptionLabel)
      .setMinValues(0)
      .setMaxValues(25)
      .setDisabled(disabled);
    if (current.length) select.setDefaultUsers(current.slice(0, 25));
    return new ActionRowBuilder().addComponents(select);
  }

  // eventType — StringSelectMenu with fixed options
  const select = new StringSelectMenuBuilder()
    .setCustomId(`logcfg:setexceptions:${category}`)
    .setPlaceholder(info.exceptionLabel)
    .setMinValues(0)
    .setMaxValues(serverLogEventTypeOptions.length)
    .setDisabled(disabled)
    .addOptions(
      serverLogEventTypeOptions.map((o) =>
        new StringSelectMenuOptionBuilder()
          .setValue(o.value)
          .setLabel(o.label)
          .setDescription(o.description)
          .setDefault(current.includes(o.value)),
      ),
    );
  return new ActionRowBuilder().addComponents(select);
}

function describeExceptions(category: LogCategoryKey, cfg: LogConfigDoc | null): string {
  const info = getLogCategoryInfo(category)!;
  const current = cfg?.[category]?.exceptions ?? [];
  if (!current.length) return '*None set*';

  if (info.exceptionKind === 'channel' || info.exceptionKind === 'voiceChannel') {
    return current.map((id) => `<#${id}>`).join(', ');
  }
  if (info.exceptionKind === 'role') {
    return current.map((id) => `<@&${id}>`).join(', ');
  }
  if (info.exceptionKind === 'user') {
    return current.map((id) => `<@${id}>`).join(', ');
  }
  return current
    .map((v) => serverLogEventTypeOptions.find((o) => o.value === v)?.label ?? v)
    .join(', ');
}

export async function buildLogCategoryPayload(
  client: LevitateClient,
  guildId: string,
  category: LogCategoryKey,
  disabled = false,
) {
  const info = getLogCategoryInfo(category);
  if (!info) return buildLogHomePayload(client, guildId, disabled);

  const cfg = client.db ? await client.db.getLogConfig(guildId).catch((): null => null) : null;

  const channelSelect = new ChannelSelectMenuBuilder()
    .setCustomId(`logcfg:setchannel:${category}`)
    .setPlaceholder(`Select the channel for ${info.label}…`)
    .setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
    .setMinValues(1)
    .setMaxValues(1)
    .setDisabled(disabled);
  if (cfg?.[category]?.channel_id) channelSelect.setDefaultChannels(cfg[category]!.channel_id);

  const enabled = cfg?.[category]?.enabled ?? true;

  const container = new ContainerBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`## ${emojis.clock} ${info.label}`),
    )
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `${info.description}\n\n` +
        `${emojis.whiteArrow2} **Channel:** ${channelLabel(cfg?.[category]?.channel_id ?? null)}\n` +
        `${emojis.whiteArrow2} **Status:** ${enabled ? `${emojis.greenTick} Enabled` : `${emojis.redcross} Disabled`}\n` +
        `${emojis.whiteArrow2} **Exceptions:** ${describeExceptions(category, cfg)}`,
      ),
    )
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
    .addActionRowComponents(new ActionRowBuilder().addComponents(channelSelect) as any)
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(CHANNEL_SEARCH_HINT))
    .addActionRowComponents(buildExceptionsRow(category, cfg, disabled) as any)
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
    .addActionRowComponents(buildToggleAndHomeRow(category, enabled, disabled));

  return {
    components: [container],
    flags: MessageFlags.IsComponentsV2,
    allowedMentions: { parse: [] as string[] },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Interaction handler — routed here for anything with customId `logcfg:*`
// ─────────────────────────────────────────────────────────────────────────────

function hasManageGuild(interaction: any): boolean {
  return !!interaction.member?.permissions?.has?.(PermissionFlagsBits.ManageGuild);
}

async function denyNoPermission(interaction: any): Promise<void> {
  await interaction.reply({
    content: 'You need the **Manage Server** permission to configure logging.',
    flags: MessageFlags.Ephemeral,
  }).catch((): null => null);
}

export async function handleLogConfigInteraction(interaction: any, client: LevitateClient): Promise<void> {
  if (!interaction.guildId) return;
  if (!hasManageGuild(interaction)) return void (await denyNoPermission(interaction));

  const customId: string = interaction.customId;
  const parts = customId.split(':');
  const action = parts[1];
  const category = parts[2] as LogCategoryKey | 'all' | undefined;
  const guildId: string = interaction.guildId;
  const messageId: string = interaction.message?.id;

  // ── Home button ──────────────────────────────────────────────────────────
  if (interaction.isButton() && action === 'home') {
    const payload = await buildLogHomePayload(client, guildId, false);
    await interaction.update(payload).catch((): null => null);
    if (messageId) registerLogMenuSession(messageId, { page: 'home', guildId, channelId: interaction.channelId, client });
    return;
  }

  // ── Toggle enable/disable (button) ───────────────────────────────────────
  if (interaction.isButton() && action === 'toggle' && category) {
    if (!client.db) return void (await interaction.reply({ content: 'Database is not connected.', flags: MessageFlags.Ephemeral }).catch((): null => null));

    const current = await client.db.getLogConfig(guildId);

    if (category === 'all') {
      const newEnabled = !(current.all_enabled ?? true);
      await client.db.setLogAllEnabled(guildId, newEnabled);
      const payload = await buildLogAllPayload(client, guildId, false);
      await interaction.update(payload).catch((): null => null);
      if (messageId) registerLogMenuSession(messageId, { page: 'all', guildId, channelId: interaction.channelId, client });
    } else {
      const newEnabled = !(current[category as LogCategoryKey]?.enabled ?? true);
      await client.db.setLogCategoryEnabled(guildId, category as LogCategoryKey, newEnabled);
      const payload = await buildLogCategoryPayload(client, guildId, category as LogCategoryKey, false);
      await interaction.update(payload).catch((): null => null);
      if (messageId) registerLogMenuSession(messageId, { page: category as LogCategoryKey, guildId, channelId: interaction.channelId, client });
    }
    return;
  }

  // ── Home dropdown navigation ─────────────────────────────────────────────
  if (interaction.isStringSelectMenu() && action === 'nav') {
    const target = interaction.values[0] as string;
    const payload = target === 'all'
      ? await buildLogAllPayload(client, guildId, false)
      : await buildLogCategoryPayload(client, guildId, target as LogCategoryKey, false);
    await interaction.update(payload).catch((): null => null);
    if (messageId) registerLogMenuSession(messageId, { page: target as any, guildId, channelId: interaction.channelId, client });
    return;
  }

  // ── Set channel (ChannelSelectMenu) ──────────────────────────────────────
  if (interaction.isChannelSelectMenu() && action === 'setchannel' && category) {
    const channelId = interaction.values[0] as string | undefined;
    if (!client.db) return void (await interaction.reply({ content: 'Database is not connected.', flags: MessageFlags.Ephemeral }).catch((): null => null));

    if (category === 'all') {
      await client.db.setLogAllChannel(guildId, channelId ?? null);
      const payload = await buildLogAllPayload(client, guildId, false);
      await interaction.update(payload).catch((): null => null);
      if (messageId) registerLogMenuSession(messageId, { page: 'all', guildId, channelId: interaction.channelId, client });
    } else {
      await client.db.setLogCategoryChannel(guildId, category, channelId ?? null);
      const payload = await buildLogCategoryPayload(client, guildId, category, false);
      await interaction.update(payload).catch((): null => null);
      if (messageId) registerLogMenuSession(messageId, { page: category, guildId, channelId: interaction.channelId, client });
    }
    return;
  }

  // ── Set exceptions (ChannelSelectMenu / RoleSelectMenu / UserSelectMenu / StringSelectMenu) ──
  if (action === 'setexceptions' && category && category !== 'all') {
    const values: string[] = interaction.values ?? [];
    if (!client.db) return void (await interaction.reply({ content: 'Database is not connected.', flags: MessageFlags.Ephemeral }).catch((): null => null));

    await client.db.setLogCategoryExceptions(guildId, category as LogCategoryKey, values);
    const payload = await buildLogCategoryPayload(client, guildId, category as LogCategoryKey, false);
    await interaction.update(payload).catch((): null => null);
    if (messageId) registerLogMenuSession(messageId, { page: category as LogCategoryKey, guildId, channelId: interaction.channelId, client });
    return;
  }
}
