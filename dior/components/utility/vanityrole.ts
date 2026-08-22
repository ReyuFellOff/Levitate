import { config } from '../../config.js';
// xoxo/components/utility/vanityrole.ts
//
// Interactive panel handler for the vanity-role system.
//
// Two panels:
//   STATUS panel — configure the custom-status keyword trigger
//   TAG panel    — configure the server-tag (clan tag) trigger
//
// Session model (mirrors namestyle.ts):
//   scopeId  = the command message ID (known before the panel is sent, used in
//               all customIds so future interactions can find the session)
//   botMsgId = the bot's reply message ID (stored in session for editing on
//              modal submit, where interaction.message is not available)
//
// Timeout: 10 minutes of inactivity disables all components.
//
// CustomId scheme:
//   vr:<action>:<trigger?>:<scopeId>
//   vr-modal:<action>:<trigger?>:<scopeId>
//   "trigger" is "status" or "tag"; "chan" has no trigger (channel is shared).

import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelSelectMenuBuilder,
  ChannelType,
  ContainerBuilder,
  MessageFlags,
  ModalBuilder,
  PermissionFlagsBits,
  RoleSelectMenuBuilder,
  SeparatorBuilder,
  TextDisplayBuilder,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';
import type { LevitateClient }       from '../../structures/LevitateClient.js';
import type { VanityRoleSettingsDoc } from '../../database/database.js';
import { emojis }                    from '../../emojis.js';
import { parseSayText }              from '../../helpers/emojiParser.js';
import { resolveEmoji }              from '../../helpers/emojiResolver.js';

// ─────────────────────────────────────────────────────────────────────────────
// Session
// ─────────────────────────────────────────────────────────────────────────────

const TIMEOUT_MS = 10 * 60_000; // 10 minutes

interface VrSession {
  page:      'status' | 'tag';
  guildId:   string;
  channelId: string;
  botMsgId:  string;           // bot's panel message; stored for modal-submit edits
  client:    LevitateClient;
}

const sessions = new Map<string, VrSession>();
const timeouts = new Map<string, NodeJS.Timeout>();

export function registerVrSession(scopeId: string, session: VrSession): void {
  sessions.set(scopeId, session);
  resetTimeout(scopeId);
}

function resetTimeout(scopeId: string): void {
  clearTimeout(timeouts.get(scopeId));
  const s = sessions.get(scopeId);
  if (!s) return;

  timeouts.set(scopeId, setTimeout(async () => {
    sessions.delete(scopeId);
    timeouts.delete(scopeId);
    try {
      const ch  = await s.client.channels.fetch(s.channelId) as any;
      const msg = await ch.messages.fetch(s.botMsgId);
      const cfg = await s.client.db?.getVanityRoleSettings(s.guildId).catch((): null => null) ?? null;
      await msg.edit(s.page === 'status'
        ? buildStatusPayload(cfg, scopeId, true)
        : buildTagPayload(cfg, scopeId, true),
      );
    } catch { /* message gone */ }
  }, TIMEOUT_MS));
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Extract the scopeId from any vr: customId (always the last colon-segment). */
function parseScopeId(customId: string): string {
  const segments = customId.split(':');
  return segments[segments.length - 1];
}

function wrap(container: ContainerBuilder): any {
  return { components: [container], flags: MessageFlags.IsComponentsV2, allowedMentions: { parse: [] } };
}

function statusLine(enabled: boolean | undefined, hasConfig: boolean): string {
  if (enabled === false) return `${emojis.redcross} Disabled — config is saved, re-enable to activate`;
  if (hasConfig)         return `${emojis.greenTick} Active`;
  return 'Inactive — finish setup below to activate';
}

function msgPreview(text: string | null | undefined, data: string | null | undefined): string {
  if (!text && !data) return '*Not set*';
  const parts: string[] = [];
  if (text) parts.push(`"${text.slice(0, 60)}${(text.length > 60) ? '…' : ''}"`);
  if (data) parts.push(`saved data: \`${data}\``);
  return parts.join(' + ');
}

// ─────────────────────────────────────────────────────────────────────────────
// Panel builders
// ─────────────────────────────────────────────────────────────────────────────

export function buildStatusPayload(
  settings: VanityRoleSettingsDoc | null,
  scopeId:  string,
  disabled  = false,
): any {
  const s         = settings;
  const enabled   = s?.status_enabled;
  const hasConfig = !!(s?.status_keyword && s?.status_role_id);
  const hasMsg    = !!(s?.status_message_text || s?.status_message_data);
  const isEnabled = enabled !== false;

  const info = [
    `${emojis.glowyWhiteArrow} **Status:** ${statusLine(enabled, hasConfig)}`,
    `${emojis.glowyWhiteArrow} **Keyword:** ${s?.status_keyword ? `\`${s.status_keyword}\`` : '*Not set*'}`,
    `${emojis.glowyWhiteArrow} **Role:** ${s?.status_role_id ? `<@&${s.status_role_id}>` : '*Not set*'}`,
    `${emojis.glowyWhiteArrow} **Channel:** ${s?.message_channel_id ? `<#${s.message_channel_id}>` : '*Not set — messages will not be sent*'}`,
    `${emojis.glowyWhiteArrow} **Message:** ${msgPreview(s?.status_message_text, s?.status_message_data)}`,
  ].join('\n');

  const btnRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`vr:keyword:${scopeId}`)
      .setLabel('Set Keyword')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(disabled),
    new ButtonBuilder()
      .setCustomId(`vr:msg:status:${scopeId}`)
      .setLabel('Set Message')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(disabled),
    new ButtonBuilder()
      .setCustomId(`vr:clrmsg:status:${scopeId}`)
      .setLabel('Clear Message')
      .setStyle(ButtonStyle.Danger)
      .setDisabled(disabled || !hasMsg),
    new ButtonBuilder()
      .setCustomId(`vr:toggle:status:${scopeId}`)
      .setLabel(isEnabled ? 'Disable' : 'Enable')
      .setStyle(isEnabled ? ButtonStyle.Danger : ButtonStyle.Success)
      .setDisabled(disabled),
  );

  const roleSelect = new RoleSelectMenuBuilder()
    .setCustomId(`vr:role:status:${scopeId}`)
    .setPlaceholder(s?.status_role_id ? 'Change role…' : 'Select a role to assign…')
    .setDisabled(disabled);
  if (s?.status_role_id) roleSelect.setDefaultRoles(s.status_role_id);
  const roleRow = new ActionRowBuilder<RoleSelectMenuBuilder>().addComponents(roleSelect);

  const chanSelect = new ChannelSelectMenuBuilder()
    .setCustomId(`vr:chan:${scopeId}`)
    .setPlaceholder(s?.message_channel_id ? 'Change announcement channel…' : 'Select announcement channel…')
    .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
    .setDisabled(disabled);
  if (s?.message_channel_id) chanSelect.setDefaultChannels(s.message_channel_id);
  const chanRow = new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(chanSelect);

  const container = new ContainerBuilder().setAccentColor(parseInt(config.defaultAccentColor.replace('#', ''), 16))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent('## Vanity Role — Status / Bio'))
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(info))
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
    .addActionRowComponents(btnRow as any)
    .addActionRowComponents(roleRow as any)
    .addActionRowComponents(chanRow as any)
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(
      disabled
        ? '-# This panel has expired — run the command again to make changes.'
        : [
            '-# Matches anywhere in a member\'s custom status.',
            '-# Role is removed automatically when the keyword leaves.',
          ].join('\n'),
    ));

  return wrap(container);
}

export function buildTagPayload(
  settings: VanityRoleSettingsDoc | null,
  scopeId:  string,
  disabled  = false,
): any {
  const s         = settings;
  const enabled   = s?.tag_enabled;
  const hasConfig = !!(s?.tag_role_id);
  const hasMsg    = !!(s?.tag_message_text || s?.tag_message_data);
  const isEnabled = enabled !== false;

  const info = [
    `${emojis.glowyWhiteArrow} **Status:** ${statusLine(enabled, hasConfig)}`,
    `${emojis.glowyWhiteArrow} **Role:** ${s?.tag_role_id ? `<@&${s.tag_role_id}>` : '*Not set*'}`,
    `${emojis.glowyWhiteArrow} **Channel:** ${s?.message_channel_id ? `<#${s.message_channel_id}>` : '*Not set — messages will not be sent*'}`,
    `${emojis.glowyWhiteArrow} **Message:** ${msgPreview(s?.tag_message_text, s?.tag_message_data)}`,
  ].join('\n');

  const btnRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`vr:msg:tag:${scopeId}`)
      .setLabel('Set Message')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(disabled),
    new ButtonBuilder()
      .setCustomId(`vr:clrmsg:tag:${scopeId}`)
      .setLabel('Clear Message')
      .setStyle(ButtonStyle.Danger)
      .setDisabled(disabled || !hasMsg),
    new ButtonBuilder()
      .setCustomId(`vr:toggle:tag:${scopeId}`)
      .setLabel(isEnabled ? 'Disable' : 'Enable')
      .setStyle(isEnabled ? ButtonStyle.Danger : ButtonStyle.Success)
      .setDisabled(disabled),
  );

  const roleSelect = new RoleSelectMenuBuilder()
    .setCustomId(`vr:role:tag:${scopeId}`)
    .setPlaceholder(s?.tag_role_id ? 'Change role…' : 'Select a role to assign…')
    .setDisabled(disabled);
  if (s?.tag_role_id) roleSelect.setDefaultRoles(s.tag_role_id);
  const roleRow = new ActionRowBuilder<RoleSelectMenuBuilder>().addComponents(roleSelect);

  const chanSelect = new ChannelSelectMenuBuilder()
    .setCustomId(`vr:chan:${scopeId}`)
    .setPlaceholder(s?.message_channel_id ? 'Change announcement channel…' : 'Select announcement channel…')
    .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
    .setDisabled(disabled);
  if (s?.message_channel_id) chanSelect.setDefaultChannels(s.message_channel_id);
  const chanRow = new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(chanSelect);

  const container = new ContainerBuilder().setAccentColor(parseInt(config.defaultAccentColor.replace('#', ''), 16))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent('## Vanity Role — Server Tag'))
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(info))
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
    .addActionRowComponents(btnRow as any)
    .addActionRowComponents(roleRow as any)
    .addActionRowComponents(chanRow as any)
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(
      disabled
        ? '-# This panel has expired — run the command again to make changes.'
        : [
            '-# Triggers when a member equips this server\'s tag.',
            '-# Role is removed automatically when they unequip it.',
          ].join('\n'),
    ));

  return wrap(container);
}

// ─────────────────────────────────────────────────────────────────────────────
// Modals
// ─────────────────────────────────────────────────────────────────────────────

function buildKeywordModal(scopeId: string): ModalBuilder {
  return new ModalBuilder()
    .setCustomId(`vr-modal:keyword:${scopeId}`)
    .setTitle('Set Status Keyword')
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('keyword')
          .setLabel('Keyword')
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('/paradise')
          .setMaxLength(100)
          .setRequired(true),
      ),
    );
}

function buildMessageModal(trigger: 'status' | 'tag', scopeId: string): ModalBuilder {
  return new ModalBuilder()
    .setCustomId(`vr-modal:msg:${trigger}:${scopeId}`)
    .setTitle(trigger === 'status' ? 'Set Status Gain Message' : 'Set Tag Gain Message')
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('text')
          .setLabel('Message text')
          .setStyle(TextInputStyle.Paragraph)
          .setPlaceholder('${user_mention} now has the role!')
          .setMaxLength(1500)
          .setRequired(false),
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('data')
          .setLabel('Saved data name (optional)')
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('my-embed')
          .setRequired(false),
      ),
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// Interaction handler (entry point from interactionCreate.ts)
// ─────────────────────────────────────────────────────────────────────────────

export async function handleVanityRoleInteraction(
  interaction: any,
  client:      LevitateClient,
): Promise<void> {
  if (!interaction.guild || !client.db) return;

  // Re-check ManageGuild on every interaction (panel is persistent, not per-user)
  if (!interaction.memberPermissions?.has?.(PermissionFlagsBits.ManageGuild)) {
    await interaction.reply({
      content: 'You need the **Manage Server** permission to use this panel.',
      flags:   MessageFlags.Ephemeral,
    }).catch((): null => null);
    return;
  }

  const guild   = interaction.guild;
  const rawId   = interaction.customId as string;
  const scopeId = parseScopeId(rawId);

  // ── Modal submit ──────────────────────────────────────────────────────────
  if (interaction.isModalSubmit?.()) {
    // Strip 'vr-modal:' and parse: [action, trigger?, scopeId]
    const inner  = rawId.slice('vr-modal:'.length).split(':');
    const action = inner[0]; // 'keyword' | 'msg'
    // trigger is inner[1] when action==='msg', scopeId is always last
    const trigger = (action === 'msg' ? inner[1] : 'status') as 'status' | 'tag';

    await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch((): null => null);

    const session = sessions.get(scopeId);

    if (action === 'keyword') {
      const keyword = interaction.fields?.getTextInputValue('keyword')?.trim() ?? '';
      if (!keyword) {
        await interaction.editReply({ content: 'Keyword cannot be empty.' }).catch((): null => null);
        return;
      }
      await client.db.setVanityRoleStatusConfig(guild.id, { status_keyword: keyword });

    } else if (action === 'msg') {
      const rawText = interaction.fields?.getTextInputValue('text')?.trim() || null;
      const dataRaw = interaction.fields?.getTextInputValue('data')?.trim() || null;

      let parsedText: string | null = rawText;
      if (rawText) {
        const { text: resolved, invalid } = await parseSayText(
          rawText,
          (id: string) => resolveEmoji(client, id, guild),
        ).catch((): { text: string; invalid: string[] } => ({ text: rawText, invalid: [] }));
        if (invalid.length) {
          await interaction.editReply({
            content: `Could not resolve emoji: ${invalid.map((i: string) => `\`${i}\``).join(', ')}`,
          }).catch((): null => null);
          return;
        }
        parsedText = resolved;
      }

      if (dataRaw) {
        const exists = await client.db.savedDataNameExists(guild.id, dataRaw).catch((): boolean => false);
        if (!exists) {
          await interaction.editReply({
            content: `No saved data named \`${dataRaw}\` found. Use \`$view-data\` to list saved entries.`,
          }).catch((): null => null);
          return;
        }
      }

      if (trigger === 'status') {
        await client.db.setVanityRoleStatusConfig(guild.id, {
          status_message_text: parsedText ?? null,
          status_message_data: dataRaw  ?? null,
        });
      } else {
        await client.db.setVanityRoleTagConfig(guild.id, {
          tag_message_text: parsedText ?? null,
          tag_message_data: dataRaw  ?? null,
        });
      }
    }

    // Refresh the panel via direct message edit (no interaction.update on modal submits)
    if (session) {
      try {
        const ch  = await client.channels.fetch(session.channelId) as any;
        const msg = await ch.messages.fetch(session.botMsgId);
        const cfg = await client.db.getVanityRoleSettings(guild.id).catch((): null => null);
        await msg.edit(session.page === 'status'
          ? buildStatusPayload(cfg, scopeId, false)
          : buildTagPayload(cfg, scopeId, false),
        );
        resetTimeout(scopeId);
      } catch { /* panel gone */ }
    }

    await interaction.deleteReply().catch((): null => null);
    return;
  }

  // ── Component interactions (buttons, role/channel selects) ────────────────
  const session = sessions.get(scopeId);
  if (!session) {
    await interaction.reply({
      content: 'This panel has expired — run the command again.',
      flags:   MessageFlags.Ephemeral,
    }).catch((): null => null);
    return;
  }

  // inner = rawId with 'vr:' stripped, split by ':'
  const inner   = rawId.slice('vr:'.length).split(':');
  const action  = inner[0];
  const trigger = (inner[1] === 'status' || inner[1] === 'tag')
    ? (inner[1] as 'status' | 'tag')
    : session.page;

  // ── Set Keyword (opens modal) ─────────────────────────────────────────────
  if (action === 'keyword') {
    await interaction.showModal(buildKeywordModal(scopeId)).catch((): null => null);
    return;
  }

  // ── Set Message (opens modal) ─────────────────────────────────────────────
  if (action === 'msg') {
    await interaction.showModal(buildMessageModal(trigger, scopeId)).catch((): null => null);
    return;
  }

  // ── Clear Message ─────────────────────────────────────────────────────────
  if (action === 'clrmsg') {
    if (trigger === 'status') {
      await client.db.setVanityRoleStatusConfig(guild.id, {
        status_message_text: null,
        status_message_data: null,
      });
    } else {
      await client.db.setVanityRoleTagConfig(guild.id, {
        tag_message_text: null,
        tag_message_data: null,
      });
    }
    await refreshPanel(interaction, client, session, scopeId);
    return;
  }

  // ── Role select ───────────────────────────────────────────────────────────
  if (action === 'role') {
    const roleId = interaction.values?.[0] as string | undefined;
    if (!roleId) { await interaction.deferUpdate().catch((): null => null); return; }

    // Validate role hierarchy
    const role = guild.roles.cache.get(roleId)
      ?? await guild.roles.fetch(roleId).catch((): null => null);
    if (role?.managed) {
      await interaction.reply({
        content: 'Cannot use managed (bot-integrated) roles.',
        flags:   MessageFlags.Ephemeral,
      }).catch((): null => null);
      return;
    }
    if (role && role.position >= (guild.members.me?.roles?.highest?.position ?? 0)) {
      await interaction.reply({
        content: 'That role is above or equal to my highest role — I cannot assign it.',
        flags:   MessageFlags.Ephemeral,
      }).catch((): null => null);
      return;
    }

    if (trigger === 'status') {
      await client.db.setVanityRoleStatusConfig(guild.id, { status_role_id: roleId });
    } else {
      await client.db.setVanityRoleTagConfig(guild.id, { tag_role_id: roleId });
    }
    await refreshPanel(interaction, client, session, scopeId);
    return;
  }

  // ── Channel select (shared between both triggers) ─────────────────────────
  if (action === 'chan') {
    const channelId = (interaction.values?.[0] as string | undefined) ?? null;
    await client.db.setVanityRoleMessageChannel(guild.id, channelId);
    await refreshPanel(interaction, client, session, scopeId);
    return;
  }

  // ── Toggle enable / disable ───────────────────────────────────────────────
  if (action === 'toggle') {
    const cfg       = await client.db.getVanityRoleSettings(guild.id).catch((): null => null);
    const nowActive = trigger === 'status'
      ? (cfg?.status_enabled !== false)
      : (cfg?.tag_enabled    !== false);

    if (trigger === 'status') {
      await client.db.setVanityRoleStatusConfig(guild.id, { status_enabled: !nowActive });
    } else {
      await client.db.setVanityRoleTagConfig(guild.id, { tag_enabled: !nowActive });
    }
    await refreshPanel(interaction, client, session, scopeId);
    return;
  }

  await interaction.deferUpdate().catch((): null => null);
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal: refresh the panel via interaction.update
// ─────────────────────────────────────────────────────────────────────────────

async function refreshPanel(
  interaction: any,
  client:      LevitateClient,
  session:     VrSession,
  scopeId:     string,
): Promise<void> {
  const cfg     = await client.db?.getVanityRoleSettings(session.guildId).catch((): null => null) ?? null;
  const payload = session.page === 'status'
    ? buildStatusPayload(cfg, scopeId, false)
    : buildTagPayload(cfg, scopeId, false);
  await interaction.update(payload).catch((): null => null);
  resetTimeout(scopeId);
}
