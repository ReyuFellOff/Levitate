// xoxo/components/utility/autorole.ts
//
// Interactive panel for the autorole system — roles automatically given to
// new members when they join, with separate role lists for humans and bots.
//
// Session model (mirrors vanityrole.ts):
//   scopeId  = the command message ID (known before the panel is sent, used in
//              all customIds so future interactions can find the session)
//   botMsgId = the bot's reply message ID
//
// Timeout: 10 minutes of inactivity disables all components.
//
// CustomId scheme:
//   ar:<action>:<scopeId>
//   action: 'members' | 'bots' | 'toggle' | 'clear-members' | 'clear-bots'

import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  MessageFlags,
  PermissionFlagsBits,
  RoleSelectMenuBuilder,
  SeparatorBuilder,
  TextDisplayBuilder,
} from 'discord.js';
import { config } from '../../config.js';
import type { LevitateClient }      from '../../structures/LevitateClient.js';
import type { AutoroleConfigDoc }   from '../../database/database.js';
import { emojis }                   from '../../emojis.js';

const TIMEOUT_MS = 10 * 60_000; // 10 minutes
const MAX_ROLES  = 25; // Discord's role-select-menu hard cap

// ─────────────────────────────────────────────────────────────────────────────
// Session
// ─────────────────────────────────────────────────────────────────────────────

interface ArSession {
  guildId:   string;
  channelId: string;
  botMsgId:  string;
  client:    LevitateClient;
}

const sessions = new Map<string, ArSession>();
const timeouts = new Map<string, NodeJS.Timeout>();

export function registerArSession(scopeId: string, session: ArSession): void {
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
      const cfg = await s.client.db?.getAutoroleConfig(s.guildId).catch((): null => null) ?? null;
      await msg.edit(buildPanel(cfg, scopeId, true));
    } catch { /* message gone */ }
  }, TIMEOUT_MS));
}

function parseScopeId(customId: string): string {
  const segments = customId.split(':');
  return segments[segments.length - 1];
}

function wrap(container: ContainerBuilder): any {
  return { components: [container], flags: MessageFlags.IsComponentsV2, allowedMentions: { parse: [] } };
}

function roleListLine(ids: string[] | undefined): string {
  if (!ids || ids.length === 0) return '*None set*';
  return ids.map((id) => `<@&${id}>`).join(', ');
}

// ─────────────────────────────────────────────────────────────────────────────
// Panel builder
// ─────────────────────────────────────────────────────────────────────────────

export function buildPanel(
  settings: AutoroleConfigDoc | null,
  scopeId:  string,
  disabled  = false,
): any {
  const s          = settings;
  const memberIds  = s?.member_role_ids ?? [];
  const botIds     = s?.bot_role_ids ?? [];
  const isEnabled  = s?.enabled !== false;
  const hasConfig  = memberIds.length > 0 || botIds.length > 0;

  const info = [
    `${emojis.glowyWhiteArrow} **Status:** ${isEnabled
      ? (hasConfig ? `${emojis.greenTick} Active` : 'Enabled — but no roles are set yet')
      : `${emojis.redcross} Disabled — config is saved, re-enable to activate`}`,
    `${emojis.glowyWhiteArrow} **Member roles:** ${roleListLine(memberIds)}`,
    `${emojis.glowyWhiteArrow} **Bot roles:** ${roleListLine(botIds)}`,
  ].join('\n');

  const memberSelect = new RoleSelectMenuBuilder()
    .setCustomId(`ar:members:${scopeId}`)
    .setPlaceholder('Select roles for new members…')
    .setMinValues(0)
    .setMaxValues(MAX_ROLES)
    .setDisabled(disabled);
  if (memberIds.length > 0) memberSelect.setDefaultRoles(memberIds);
  const memberRow = new ActionRowBuilder<RoleSelectMenuBuilder>().addComponents(memberSelect);

  const botSelect = new RoleSelectMenuBuilder()
    .setCustomId(`ar:bots:${scopeId}`)
    .setPlaceholder('Select roles for new bots…')
    .setMinValues(0)
    .setMaxValues(MAX_ROLES)
    .setDisabled(disabled);
  if (botIds.length > 0) botSelect.setDefaultRoles(botIds);
  const botRow = new ActionRowBuilder<RoleSelectMenuBuilder>().addComponents(botSelect);

  const btnRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`ar:toggle:${scopeId}`)
      .setLabel(isEnabled ? 'Disable' : 'Enable')
      .setStyle(isEnabled ? ButtonStyle.Danger : ButtonStyle.Success)
      .setDisabled(disabled),
    new ButtonBuilder()
      .setCustomId(`ar:clear-members:${scopeId}`)
      .setLabel('Clear Member Roles')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(disabled || memberIds.length === 0),
    new ButtonBuilder()
      .setCustomId(`ar:clear-bots:${scopeId}`)
      .setLabel('Clear Bot Roles')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(disabled || botIds.length === 0),
  );

  const container = new ContainerBuilder()
    .setAccentColor(parseInt(config.defaultAccentColor.replace('#', ''), 16))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent('## Autorole'))
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(info))
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
    .addActionRowComponents(memberRow as any)
    .addActionRowComponents(botRow as any)
    .addActionRowComponents(btnRow as any)
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(
      disabled
        ? '-# This panel has expired — run the command again to make changes.'
        : [
            '-# Roles above my highest role, or managed by an integration, are skipped when assigning.',
            '-# Members and bots are handled separately — pick as many roles as you like for each.',
          ].join('\n'),
    ));

  return wrap(container);
}

// ─────────────────────────────────────────────────────────────────────────────
// Interaction handler (entry point from interactionCreate.ts)
// ─────────────────────────────────────────────────────────────────────────────

export async function handleAutoroleInteraction(
  interaction: any,
  client:      LevitateClient,
): Promise<void> {
  if (!interaction.guild || !client.db) return;

  if (!interaction.memberPermissions?.has?.(PermissionFlagsBits.ManageRoles)) {
    await interaction.reply({
      content: 'You need the **Manage Roles** permission to use this panel.',
      flags:   MessageFlags.Ephemeral,
    }).catch((): null => null);
    return;
  }

  const guild   = interaction.guild;
  const rawId   = interaction.customId as string;
  const scopeId = parseScopeId(rawId);

  const session = sessions.get(scopeId);
  if (!session || session.guildId !== guild.id) {
    await interaction.reply({
      content: 'This panel has expired — run the command again.',
      flags:   MessageFlags.Ephemeral,
    }).catch((): null => null);
    return;
  }

  // inner = rawId with 'ar:' stripped, split by ':' -> [action, scopeId]
  const action = rawId.slice('ar:'.length).split(':')[0];

  if (action === 'members' || action === 'bots') {
    const botTop     = guild.members.me?.roles?.highest?.position ?? 0;
    const isOwner    = interaction.user.id === guild.ownerId;
    const invokerTop = isOwner ? Infinity : (interaction.member?.roles?.highest?.position ?? 0);
    const chosen     = (interaction.values as string[]) ?? [];

    // Skip roles neither the bot NOR the acting admin could actually assign —
    // this stops a Manage Roles user from configuring autorole to hand out
    // roles above their own rank (e.g. an admin-level role) via the panel.
    const valid: string[] = [];
    for (const id of chosen) {
      const role = guild.roles.cache.get(id) ?? await guild.roles.fetch(id).catch((): null => null);
      if (!role || role.managed || role.id === guild.id) continue;
      if (role.position >= botTop || role.position >= invokerTop) continue;
      valid.push(id);
    }

    await client.db.setAutoroleConfig(guild.id, {
      [action === 'members' ? 'member_role_ids' : 'bot_role_ids']: valid,
    } as any);

    await refreshPanel(interaction, client, session, scopeId);

    if (valid.length !== chosen.length) {
      await interaction.followUp({
        content: 'Some selected roles were skipped because they are above your or my highest role, managed by an integration, or @everyone.',
        flags:   MessageFlags.Ephemeral,
      }).catch((): null => null);
    }
    return;
  }

  if (action === 'clear-members' || action === 'clear-bots') {
    await client.db.setAutoroleConfig(guild.id, {
      [action === 'clear-members' ? 'member_role_ids' : 'bot_role_ids']: [],
    } as any);
    await refreshPanel(interaction, client, session, scopeId);
    return;
  }

  if (action === 'toggle') {
    const cfg = await client.db.getAutoroleConfig(guild.id).catch((): null => null);
    const nowActive = cfg?.enabled !== false;
    await client.db.setAutoroleConfig(guild.id, { enabled: !nowActive });
    await refreshPanel(interaction, client, session, scopeId);
    return;
  }

  await interaction.deferUpdate().catch((): null => null);
}

async function refreshPanel(
  interaction: any,
  client:      LevitateClient,
  session:     ArSession,
  scopeId:     string,
): Promise<void> {
  const cfg     = await client.db?.getAutoroleConfig(session.guildId).catch((): null => null) ?? null;
  const payload = buildPanel(cfg, scopeId, false);
  await interaction.update(payload).catch((): null => null);
  resetTimeout(scopeId);
}
