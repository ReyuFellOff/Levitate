import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelSelectMenuBuilder,
  ChannelType,
  ContainerBuilder,
  LabelBuilder,
  MessageFlags,
  ModalBuilder,
  RadioGroupBuilder,
  SectionBuilder,
  SeparatorBuilder,
  TextDisplayBuilder,
  ThumbnailBuilder,
} from 'discord.js';
import { config } from '../../config.js';
import { honeypotConfig } from '../../config/honeypot.js';
import type { CassieClient } from '../../structures/CassieClient.js';
import type { HoneypotSettingsDoc } from '../../database/database.js';
import { emojis } from '../../emojis.js';
import { authorOnlyFilter } from '../../helpers/panelGuard.js';

interface HoneypotSession {
  guildId: string;
  authorId: string;
  channelId: string;
  messageId: string;
  client: CassieClient;
}

const sessions = new Map<string, HoneypotSession>();
const TIMEOUT_MS = 10 * 60_000;

function wrap(container: ContainerBuilder): any {
  return { components: [container], flags: MessageFlags.IsComponentsV2, allowedMentions: { parse: [] } };
}

export function buildHoneypotPanel(settings: HoneypotSettingsDoc | null, token: string, disabled = false): any {
  const channelId = settings?.channel_id ?? null;
  const logId = settings?.log_channel_id ?? null;
  const action = settings?.enabled === false ? 'Disabled' : settings?.action === 'ban' ? 'Ban' : 'Softban (kick)';
  const status = channelId ? `${settings?.enabled === false ? emojis.redcross + ' Disabled' : emojis.honeypotShield + ' Armed'} in <#${channelId}>` : `${emojis.redcross} Not configured`;

  const buttons = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`hp:configure:${token}`).setLabel('Configure').setStyle(ButtonStyle.Primary).setDisabled(disabled),
    new ButtonBuilder().setCustomId(`hp:reset:${token}`).setLabel('Reset').setStyle(ButtonStyle.Danger).setDisabled(disabled),
  );

  const container = new ContainerBuilder()
    .setAccentColor(parseInt(config.defaultAccentColor.replace('#', ''), 16))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(`${emojis.honeypot} **Honeypot**\n${status}\n-# Action: **${action}** | Triggered: **${settings?.moderated_count ?? 0}**`))
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent('Configure the trap channel, event log channel, and moderation action.'))
    .addActionRowComponents(buttons)
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(disabled ? '-# This panel expired. Run the command again to configure honeypot.' : '-# Changes are applied only after Save. Server owners and administrators are ignored.'));

  return wrap(container);
}

function buildHoneypotModal(customId: string, settings: HoneypotSettingsDoc | null): ModalBuilder {
  const channelSelect = new ChannelSelectMenuBuilder()
    .setCustomId('hp:channel')
    .setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
    .setMinValues(1).setMaxValues(1);
  if (settings?.channel_id) channelSelect.setDefaultChannels(settings.channel_id);

  const logSelect = new ChannelSelectMenuBuilder()
    .setCustomId('hp:log')
    .setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
    .setMinValues(0).setMaxValues(1)
    .setRequired(false);
  if (settings?.log_channel_id) logSelect.setDefaultChannels(settings.log_channel_id);

  const action = settings?.enabled === false ? 'disabled' : settings?.action ?? 'kick';
  const actionRadio = new RadioGroupBuilder()
    .setCustomId('hp:action')
    .addOptions(
      { label: 'Softban (kick)', value: 'kick', description: 'Kicks the author and deletes their recent messages.', default: action === 'kick' },
      { label: 'Ban', value: 'ban', description: 'Permanently bans the author and deletes their recent messages.', default: action === 'ban' },
      { label: 'Disabled', value: 'disabled', description: 'Keep the warning message without moderating authors.', default: action === 'disabled' },
    );

  return new ModalBuilder()
    .setCustomId(customId)
    .setTitle('Honeypot Setup')
    .addLabelComponents(
      new LabelBuilder().setLabel('Honeypot Channel').setDescription('Any message sent here will moderate its author.').setChannelSelectMenuComponent(channelSelect),
      new LabelBuilder().setLabel('Log Channel').setDescription('Where honeypot actions are logged.').setChannelSelectMenuComponent(logSelect),
      new LabelBuilder().setLabel('Action').setDescription('What should the bot do to the message author?').setRadioGroupComponent(actionRadio),
    );
}

function awaitHoneypotModal(client: CassieClient, customId: string, userId: string): Promise<any | null> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => { client.removeListener('interactionCreate', handler); resolve(null); }, TIMEOUT_MS);
    function handler(interaction: any): void {
      if (interaction.isModalSubmit?.() && interaction.customId === customId && interaction.user?.id === userId) {
        clearTimeout(timer);
        client.removeListener('interactionCreate', handler);
        resolve(interaction);
      }
    }
    client.on('interactionCreate', handler);
  });
}

async function deleteWarningMessage(client: CassieClient, settings: HoneypotSettingsDoc): Promise<void> {
  if (!settings.channel_id || !settings.warning_message_id) return;
  const channel: any = await client.channels.fetch(settings.channel_id).catch((): null => null);
  await channel?.messages?.delete(settings.warning_message_id).catch((): null => null);
}

async function refreshHoneypotMessage(client: CassieClient, session: HoneypotSession): Promise<void> {
  const settings = await client.db?.getHoneypotSettings(session.guildId).catch((): null => null);
  const channel: any = await client.channels.fetch(session.channelId).catch((): null => null);
  await channel?.messages?.edit(session.messageId, buildHoneypotPanel(settings, session.messageId)).catch((): null => null);
}

export async function startHoneypotSession(message: any, client: CassieClient): Promise<void> {
  const settings = await client.db.getHoneypotSettings(message.guild.id).catch((): null => null);
  let channelId = settings?.channel_id ?? null;
  let currentSettings = settings;
  if (!channelId) {
    const existing = message.guild.channels.cache.find((channel: any) => channel.name === honeypotConfig.channelName && channel.type === ChannelType.GuildText);
    const channel = existing ?? await message.guild.channels.create({ name: honeypotConfig.channelName, type: ChannelType.GuildText, reason: 'Honeypot setup' });
    channelId = channel.id;
    const warningMessageId = await postWarningMessage(client, message.guild.id, channelId, 'kick', null);
    await client.db.setHoneypotSettings(message.guild.id, {
      channel_id: channelId,
      log_channel_id: null,
      warning_data: null,
      warning_message_id: warningMessageId,
      action: 'kick',
      enabled: true,
    });
    currentSettings = await client.db.getHoneypotSettings(message.guild.id).catch((): null => null);
  }
  const token = message.id;
  const sent = await message.channel.send(buildHoneypotPanel({ ...(currentSettings ?? {}), channel_id: channelId } as HoneypotSettingsDoc, token));
  const session: HoneypotSession = {
    guildId: message.guild.id, authorId: message.author.id, channelId: message.channel.id, messageId: sent.id, client,
  };
  sessions.set(token, session);
  setTimeout(() => expireSession(token), TIMEOUT_MS);
}

async function expireSession(token: string): Promise<void> {
  const session = sessions.get(token);
  if (!session) return;
  sessions.delete(token);
  const channel: any = await session.client.channels.fetch(session.channelId).catch((): null => null);
  const message = await channel?.messages?.fetch(session.messageId).catch((): null => null);
  await message?.edit(buildHoneypotPanel(null, token, true)).catch((): null => null);
}

export async function handleHoneypotInteraction(interaction: any, client: CassieClient): Promise<void> {
  const parts = String(interaction.customId).split(':');
  const token = parts[2];
  const session = sessions.get(token);
  if (!session || !authorOnlyFilter(interaction, session.authorId, (id) => id.startsWith('hp:'))) return;

  if (!interaction.isButton?.()) return;
  if (parts[1] === 'configure') {
    const modalId = `hp:modal:${token}`;
    await interaction.showModal(buildHoneypotModal(modalId, await client.db!.getHoneypotSettings(session.guildId)));
    const submit = await awaitHoneypotModal(client, modalId, session.authorId);
    if (!submit) return;
    await submit.deferUpdate().catch((): null => null);
    const channelId = submit.fields.getSelectedChannels('hp:channel')?.first()?.id;
    const logChannelId = submit.fields.getSelectedChannels('hp:log')?.first()?.id ?? null;
    const actionValue = submit.fields.getRadioGroup('hp:action') ?? 'kick';
    const action = actionValue === 'ban' ? 'ban' : 'kick';
    const enabled = actionValue !== 'disabled';
    if (!channelId) return;
    if (enabled && action === 'ban' && !submit.memberPermissions?.has?.('BanMembers')) {
      await submit.followUp({ content: 'You need Ban Members for this action.', flags: MessageFlags.Ephemeral }).catch((): null => null);
      return;
    }
    const old = await client.db!.getHoneypotSettings(session.guildId);
    if (old?.warning_message_id && (!enabled || old.channel_id !== channelId)) await deleteWarningMessage(client, old);
    const warningMessageId = enabled ? await postWarningMessage(client, session.guildId, channelId, action, null, old?.moderated_count ?? 0) : null;
    await client.db!.setHoneypotSettings(session.guildId, { channel_id: channelId, log_channel_id: logChannelId, warning_data: null, warning_message_id: warningMessageId, action, enabled });
    await refreshHoneypotMessage(client, session);
    return;
  }
  if (parts[1] === 'reset') {
    await interaction.deferUpdate();
    const old = await client.db!.getHoneypotSettings(session.guildId);
    if (old) await deleteWarningMessage(client, old);
    await client.db!.deleteHoneypotSettings(session.guildId);
    await refreshHoneypotMessage(client, session);
  }
}

export async function postWarningMessage(
  client: CassieClient,
  guildId: string,
  channelId: string,
  action: 'kick' | 'ban',
  warningData: string | null,
  count = 0,
): Promise<string | null> {
  const channel: any = await client.channels.fetch(channelId).catch((): null => null);
  if (!channel || typeof channel.send !== 'function') return null;

  if (!warningData) {
    return (await channel.send(defaultHoneypotWarning(action, count)).catch((): null => null))?.id ?? null;
  }

  const entry = await client.db?.getSavedData(guildId, warningData).catch((): null => null);
  const storageId = (client.config as any).savedDataChannelId as string | undefined;
  const storage: any = storageId
    ? (client.channels.cache.get(storageId) ?? await client.channels.fetch(storageId).catch((): null => null))
    : null;
  const storedMessage: any = storage && entry
    ? await storage.messages.fetch(entry.message_id).catch((): null => null)
    : null;
  const attachment: any = storedMessage?.attachments?.first?.();
  if (!attachment) {
    return (await channel.send(defaultHoneypotWarning(action, count)).catch((): null => null))?.id ?? null;
  }

  try {
    const response = await fetch(attachment.url);
    if (!response.ok) throw new Error(`saved CV2 fetch returned ${response.status}`);
    const parsed = JSON.parse(await response.text());
    return (await channel.send({
      components: Array.isArray(parsed) ? parsed : [parsed],
      flags: MessageFlags.IsComponentsV2,
      allowedMentions: { parse: [] },
    }).catch((): null => null))?.id ?? null;
  } catch {
    return (await channel.send(defaultHoneypotWarning(action, count)).catch((): null => null))?.id ?? null;
  }
}

export async function restoreHoneypotWarning(client: CassieClient, guildId: string, messageId: string): Promise<void> {
  const settings = await client.db?.getHoneypotSettings(guildId).catch((): null => null);
  if (!settings?.enabled || settings.warning_message_id !== messageId || !settings.channel_id) return;
  const replacementId = await postWarningMessage(client, guildId, settings.channel_id, settings.action, null, settings.moderated_count ?? 0);
  if (replacementId) await client.db?.setHoneypotSettings(guildId, { warning_message_id: replacementId });
}

export function defaultHoneypotWarning(action: 'kick' | 'ban', count = 0): any {
  const actionText = action === 'ban' ? 'a ban' : 'a kick';
  const warningText = `${emojis.honeypotTrap} **${honeypotConfig.title}**\n\n${honeypotConfig.description.replace('a kick', actionText)}\n\n-# ${emojis.honeypot} Action: **${count.toLocaleString()}**`;
  const warningSection = new SectionBuilder()
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(warningText))
    .setThumbnailAccessory(new ThumbnailBuilder().setURL(honeypotConfig.imageUrl));
  const container = new ContainerBuilder().setAccentColor(honeypotConfig.accentColor)
    .addSectionComponents(warningSection)
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent('-# Keep this message in the channel. It is restored automatically if deleted.'));
  return wrap(container);
}