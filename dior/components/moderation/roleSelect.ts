import { config } from '../../config.js';
// xoxo/components/moderation/roleSelect.ts
//
// CV2 payloads and interaction handlers for the "no role given" multi-select
// role picker used by `role add` / `role remove` (and the bare `/role manage`
// slash entry point).
//
// Behaviour:
//   - Lists roles the bot is actually able to assign AND the invoker is
//     allowed to assign: excludes @everyone, managed roles (bots' own
//     integration roles, boosters, bot-linked roles), anything at or above
//     the bot's highest role, and anything at or above the invoker's own
//     highest role (you cannot grant what you don't have).
//   - Roles the target member already has are pre-ticked (StringSelectMenu
//     default values) — Discord select menus don't support disabling
//     individual options, but pre-checking already-owned roles communicates
//     current state and lets the user simply confirm to leave them as-is.
//   - Discord's native select menu UI shows a type-to-search box once a menu
//     has enough options, so no separate search input is needed.
//   - More than 25 eligible roles requires pagination (Discord hard caps a
//     select menu at 25 options); Prev/Next buttons page through them while
//     an in-memory working set accumulates selections across pages.
//   - "Apply" diffs the working set against the member's current eligible
//     roles and applies with a single `member.roles.set()` call, so roles
//     outside the eligible set (higher than the bot or invoker, managed,
//     @everyone) are left untouched.

import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  SeparatorBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  TextDisplayBuilder,
  MessageFlags,
} from 'discord.js';
import type { CassieClient } from '../../structures/CassieClient.js';
import { emojis } from '../../emojis.js';

const PAGE_SIZE = 25;
const SESSION_TTL_MS = 5 * 60 * 1_000; // 5 minutes

// ─────────────────────────────────────────────────────────────────────────────
// Session store
// ─────────────────────────────────────────────────────────────────────────────

interface RolePickerSession {
  invokerUserId:  string;
  guildId:        string;
  targetUserId:   string;
  targetUsername: string;
  eligibleRoleIds: string[]; // ordered by position desc, chunked into pages of 25
  originalRoleIds: Set<string>; // eligible roles the member had when the panel opened
  selected:        Set<string>; // working set — mutated as the user interacts
  page:            number;
  timeout:         NodeJS.Timeout;
}

const rolePickerSessions = new Map<string, RolePickerSession>();

function resetTimeout(messageId: string): void {
  const session = rolePickerSessions.get(messageId);
  if (!session) return;
  clearTimeout(session.timeout);
  session.timeout = setTimeout(() => rolePickerSessions.delete(messageId), SESSION_TTL_MS);
}

// ─────────────────────────────────────────────────────────────────────────────
// Eligibility
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns roles that both the bot AND the invoker can manage.
 * Excludes @everyone, managed/integration roles, roles at or above the bot's
 * highest role, and roles at or above the invoker's highest role.
 * Server owners are treated as having Infinity position — they own all roles
 * the bot can reach, regardless of their actual top role.
 */
export function getEligibleRoles(guild: any, invokerMember?: any): any[] {
  const botMember = guild.members.me;
  const botTop    = botMember?.roles?.highest?.position ?? 0;
  // Server owner implicitly outranks every role; skip the invoker ceiling for them.
  const invokerIsOwner = invokerMember && invokerMember.id === guild.ownerId;
  const invokerTop = invokerIsOwner ? Infinity : (invokerMember?.roles?.highest?.position ?? Infinity);
  // Both the bot and the invoker must be above the role
  const ceiling = Math.min(botTop, invokerTop);

  return [...guild.roles.cache.values()]
    .filter((r: any) => r.id !== guild.id)    // @everyone
    .filter((r: any) => !r.managed)           // integration / bot-linked / booster roles
    .filter((r: any) => r.position < ceiling) // must be below both the bot and the invoker
    .sort((a: any, b: any) => b.position - a.position);
}

// ─────────────────────────────────────────────────────────────────────────────
// Panel builder
// ─────────────────────────────────────────────────────────────────────────────

function buildPanel(
  guild:   any,
  session: RolePickerSession,
): any {
  const totalPages = Math.max(1, Math.ceil(session.eligibleRoleIds.length / PAGE_SIZE));
  const page = Math.min(session.page, totalPages - 1);
  const pageIds = session.eligibleRoleIds.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);

  const options = pageIds
    .map((id) => guild.roles.cache.get(id))
    .filter(Boolean)
    .map((role: any) =>
      new StringSelectMenuOptionBuilder()
        .setLabel(role.name.slice(0, 100))
        .setValue(role.id)
        .setDefault(session.selected.has(role.id)),
    );

  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId('rolepick:select')
    .setPlaceholder(`Select roles for ${session.targetUsername}…`)
    .setMinValues(0)
    .setMaxValues(Math.max(options.length, 1))
    .addOptions(options.length > 0 ? options : [new StringSelectMenuOptionBuilder().setLabel('No eligible roles').setValue('none')])
    .setDisabled(options.length === 0);

  const selectRow = new ActionRowBuilder().addComponents(selectMenu);

  const navRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('rolepick:prev')
      .setLabel('Previous')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page === 0),
    new ButtonBuilder()
      .setCustomId('rolepick:next')
      .setLabel('Next')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page >= totalPages - 1),
    new ButtonBuilder()
      .setCustomId('rolepick:apply')
      .setLabel('Apply')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId('rolepick:cancel')
      .setLabel('Cancel')
      .setStyle(ButtonStyle.Danger),
  );

  const selectedCount = session.selected.size;
  const footerBits = [
    `Page **${page + 1}/${totalPages}**`,
    `**${selectedCount}** role${selectedCount === 1 ? '' : 's'} selected`,
  ];
  if (session.eligibleRoleIds.length === 0) footerBits.push('No roles are eligible — everything is above me or above you.');

  const container = new ContainerBuilder().setAccentColor(parseInt(config.defaultAccentColor.replace('#', ''), 16))
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`## ${emojis.info} Manage Roles — ${session.targetUsername}`),
    )
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        'Already-owned roles are pre-checked. Tick to add, untick to remove, then press **Apply**.\n' +
        '-# Roles equal to or above my highest role or your highest role, and managed/bot-integration roles, are hidden.',
      ),
    )
    .addActionRowComponents(selectRow as any)
    .addActionRowComponents(navRow)
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(`-# ${footerBits.join(' • ')}`));

  return {
    components:      [container],
    flags:           MessageFlags.IsComponentsV2,
    allowedMentions: { parse: [] },
  };
}

export function buildRolePickerResultPayload(
  targetUsername: string,
  added:          string[], // formatted strings (role mentions or names)
  removed:        string[],
): any {
  const lines: string[] = [];
  if (added.length === 0 && removed.length === 0) {
    lines.push('No changes were made.');
  } else {
    if (added.length > 0)   lines.push(`**Added:** ${added.join(', ')}`);
    if (removed.length > 0) lines.push(`**Removed:** ${removed.join(', ')}`);
  }

  // Single separator after the header only — no trailing separator needed
  // for such a compact result message.
  const container = new ContainerBuilder().setAccentColor(parseInt(config.defaultAccentColor.replace('#', ''), 16))
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`## ${emojis.greentick} Roles Updated — ${targetUsername}`),
    )
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(lines.join('\n')));

  return {
    components:      [container],
    flags:           MessageFlags.IsComponentsV2,
    allowedMentions: { parse: [] },
  };
}

function buildCancelledPayload(targetUsername: string): any {
  const container = new ContainerBuilder().setAccentColor(parseInt(config.defaultAccentColor.replace('#', ''), 16))
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`## ${emojis.redcross} Cancelled`),
    )
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`No role changes were made for **${targetUsername}**.`),
    );

  return {
    components:      [container],
    flags:           MessageFlags.IsComponentsV2,
    allowedMentions: { parse: [] },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Entry point — sends the initial panel and registers the session
// ─────────────────────────────────────────────────────────────────────────────

export async function sendRolePickerPanel(
  ctx:           { channel: any },
  guild:         any,
  member:        any,
  invokerUserId: string,
  invokerMember?: any,
): Promise<void> {
  // Pass the invoker member so eligible roles respect their position ceiling.
  const eligible   = getEligibleRoles(guild, invokerMember);
  const eligibleIds = eligible.map((r: any) => r.id);
  const originalIds = new Set(eligibleIds.filter((id: string) => member.roles.cache.has(id)));

  const tempSession: RolePickerSession = {
    invokerUserId,
    guildId:        guild.id,
    targetUserId:   member.id,
    targetUsername: member.user.username,
    eligibleRoleIds: eligibleIds,
    originalRoleIds: originalIds,
    selected:        new Set(originalIds),
    page:            0,
    timeout:         setTimeout(() => {}, 0),
  };
  clearTimeout(tempSession.timeout);

  const sentMsg = await ctx.channel.send(buildPanel(guild, tempSession)).catch((): null => null);
  if (!sentMsg) return;

  tempSession.timeout = setTimeout(() => rolePickerSessions.delete(sentMsg.id), SESSION_TTL_MS);
  rolePickerSessions.set(sentMsg.id, tempSession);
}

// ─────────────────────────────────────────────────────────────────────────────
// Interaction handlers
// ─────────────────────────────────────────────────────────────────────────────

async function guardSession(interaction: any): Promise<RolePickerSession | null> {
  const messageId = interaction.message?.id as string | undefined;
  const session = messageId ? rolePickerSessions.get(messageId) : undefined;

  if (!session) {
    await interaction.reply({ content: 'This role picker has expired.', flags: MessageFlags.Ephemeral }).catch((): null => null);
    return null;
  }
  if (interaction.user.id !== session.invokerUserId) {
    await interaction.reply({
      content: 'Only the person who ran this command can use this menu.',
      flags: MessageFlags.Ephemeral,
    }).catch((): null => null);
    return null;
  }
  return session;
}

export async function handleRolePickerSelect(interaction: any, _client: CassieClient): Promise<void> {
  const session = await guardSession(interaction);
  if (!session) return;
  await interaction.deferUpdate().catch((): null => null);

  const totalPages = Math.max(1, Math.ceil(session.eligibleRoleIds.length / PAGE_SIZE));
  const page = Math.min(session.page, totalPages - 1);
  const pageIds = new Set(session.eligibleRoleIds.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE));
  const chosen = new Set<string>((interaction.values as string[]).filter((v) => v !== 'none'));

  for (const id of pageIds) {
    if (chosen.has(id)) session.selected.add(id);
    else session.selected.delete(id);
  }

  resetTimeout(interaction.message.id);
  const guild = interaction.guild;
  await interaction.editReply(buildPanel(guild, session)).catch((): null => null);
}

export async function handleRolePickerPage(interaction: any, direction: 'prev' | 'next', _client: CassieClient): Promise<void> {
  const session = await guardSession(interaction);
  if (!session) return;
  await interaction.deferUpdate().catch((): null => null);

  const totalPages = Math.max(1, Math.ceil(session.eligibleRoleIds.length / PAGE_SIZE));
  session.page = direction === 'prev'
    ? Math.max(0, session.page - 1)
    : Math.min(totalPages - 1, session.page + 1);

  resetTimeout(interaction.message.id);
  const guild = interaction.guild;
  await interaction.editReply(buildPanel(guild, session)).catch((): null => null);
}

export async function handleRolePickerCancel(interaction: any, _client: CassieClient): Promise<void> {
  const session = await guardSession(interaction);
  if (!session) return;
  await interaction.deferUpdate().catch((): null => null);

  rolePickerSessions.delete(interaction.message.id);
  await interaction.message.edit(buildCancelledPayload(session.targetUsername)).catch((): null => null);
}

export async function handleRolePickerApply(interaction: any, client: CassieClient): Promise<void> {
  const session = await guardSession(interaction);
  if (!session) return;
  await interaction.deferUpdate().catch((): null => null);

  const guild = interaction.guild;
  const member = await guild.members.fetch(session.targetUserId).catch((): null => null);
  rolePickerSessions.delete(interaction.message.id);

  if (!member) {
    await interaction.message.edit(buildCancelledPayload(session.targetUsername)).catch((): null => null);
    return;
  }

  const toAdd    = [...session.selected].filter((id) => !session.originalRoleIds.has(id));
  const toRemove = [...session.originalRoleIds].filter((id) => !session.selected.has(id));

  if (toAdd.length === 0 && toRemove.length === 0) {
    await interaction.message.edit(buildRolePickerResultPayload(session.targetUsername, [], [])).catch((): null => null);
    return;
  }

  const finalRoleIds = new Set<string>(member.roles.cache.keys());
  for (const id of session.eligibleRoleIds) finalRoleIds.delete(id); // strip all eligible roles first
  for (const id of session.selected) finalRoleIds.add(id);           // re-apply only the selected ones

  const reason  = `Role update by ${interaction.user.username} (via role picker)`;
  const applied = await member.roles.set([...finalRoleIds], reason).then(() => true).catch((err: any) => {
    console.error(`[rolepicker] failed to set roles for ${session.targetUserId}: ${err?.message ?? err}`);
    return false;
  });

  if (!applied) {
    await interaction.message.edit(buildCancelledPayload(session.targetUsername)).catch((): null => null);
    return;
  }

  // Build role mention strings for the result message
  const addedMentions   = toAdd.map((id) => `<@&${id}>`);
  const removedMentions = toRemove.map((id) => `<@&${id}>`);

  await interaction.message.edit(
    buildRolePickerResultPayload(session.targetUsername, addedMentions, removedMentions),
  ).catch((): null => null);
}
