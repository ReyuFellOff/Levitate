// xoxo/commands/moderation/role-compat.ts
//
// Slash-command dispatch shim for the /role command registration.
// Prefix users who type $role get a helpful redirect message.
// Slash users get full /role add / remove / all behaviour.

import { PermissionFlagsBits } from 'discord.js';
import type { LevitateClient } from '../../structures/LevitateClient.js';
import { sendError, sendSuccess, sendInfo } from '../../components/statusMessages.js';
import { sendRolePickerPanel } from '../../components/moderation/roleSelect.js';
import {
  buildRoleAllTargetPanel,
  buildRoleAllProgressPayload,
  buildRoleAllResultPayload,
  buildRoleAllTimedOutPayload,
  buildRoleAllCancelledPayload,
  type RoleAllTargetType,
} from '../../components/moderation/roleAll.js';
import { MessageFlags } from 'discord.js';

export const options = {
  name:        'role',
  aliases:     [] as string[],
  description: 'Use $roleadd, $roleremove, or $roleall.',
  usage:       'role',
  category:    'moderation',
  owner:       false,
  cooldown:    3,
};

export async function prefixExecute(
  message: any,
  _args:   string[],
  client:  LevitateClient,
): Promise<any> {
  const prefix = client.config.prefix;
  return sendInfo(
    { message },
    `The \`${prefix}role\` command has been split into three commands:\n` +
    `\`${prefix}roleadd <user> [role]\` — add a role\n` +
    `\`${prefix}roleremove <user> [role]\` — remove a role\n` +
    `\`${prefix}roleall <role>\` — give a role to all/humans/bots`,
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Slash execute — handles /role add | remove | all
// ─────────────────────────────────────────────────────────────────────────────

const BATCH_SIZE     = 10;
const BATCH_DELAY_MS = 1000;

function validateRoleForSlash(guild: any, role: any, invokerMember?: any): string | null {
  if (!role) return 'Role not found.';
  if (role.managed) return 'That role is managed by an integration and cannot be assigned manually.';
  if (role.id === guild.id) return 'The @everyone role cannot be assigned.';
  const botMember = guild.members.me;
  if (botMember && role.position >= botMember.roles.highest.position)
    return "I can't manage a role that is at or above my highest role.";
  if (invokerMember && role.position >= invokerMember.roles.highest.position)
    return "You can't manage a role that is at or above your own highest role.";
  return null;
}

export async function slashExecute(
  interaction: any,
  client:      LevitateClient,
): Promise<any> {
  const ctx = { interaction };
  if (!interaction.guild) {
    await interaction.deferReply();
    return sendError(ctx, 'This command can only be used in a server.');
  }

  const invokerMember = interaction.member;
  if (!invokerMember?.permissions?.has?.(PermissionFlagsBits.ManageRoles)) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    return sendError(ctx, 'You need the **Manage Roles** permission to use this command.');
  }
  if (!interaction.guild.members.me?.permissions?.has?.(PermissionFlagsBits.ManageRoles)) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    return sendError(ctx, 'I need the **Manage Roles** permission.');
  }

  const sub = interaction.options.getSubcommand() as string;

  // ── /role add ──────────────────────────────────────────────────────────────
  if (sub === 'add') {
    await interaction.deferReply();
    const targetUser = interaction.options.getUser('user', true);
    const role       = interaction.options.getRole('role', false) as any | null;
    const member     = await interaction.guild.members.fetch(targetUser.id).catch((): null => null);
    if (!member) return sendError(ctx, 'That user is not a member of this server.');

    if (!role) {
      // Open picker — requires a channel-based send, not a deferred reply
      return sendRolePickerPanel({ channel: interaction.channel }, interaction.guild, member, interaction.user.id, invokerMember);
    }

    const err = validateRoleForSlash(interaction.guild, role, invokerMember);
    if (err) return sendError(ctx, err);
    if (member.roles.cache.has(role.id))
      return sendInfo(ctx, `**${targetUser.username}** already has the <@&${role.id}> role.`);

    await member.roles.add(role, `Role add via /role add by ${interaction.user.username}`);
    return sendSuccess(ctx, `Added <@&${role.id}> to **${targetUser.username}**.`);
  }

  // ── /role remove ───────────────────────────────────────────────────────────
  if (sub === 'remove') {
    await interaction.deferReply();
    const targetUser = interaction.options.getUser('user', true);
    const role       = interaction.options.getRole('role', false) as any | null;
    const member     = await interaction.guild.members.fetch(targetUser.id).catch((): null => null);
    if (!member) return sendError(ctx, 'That user is not a member of this server.');

    if (!role) {
      return sendRolePickerPanel({ channel: interaction.channel }, interaction.guild, member, interaction.user.id, invokerMember);
    }

    const err = validateRoleForSlash(interaction.guild, role, invokerMember);
    if (err) return sendError(ctx, err);
    if (!member.roles.cache.has(role.id))
      return sendInfo(ctx, `**${targetUser.username}** doesn't have the <@&${role.id}> role.`);

    await member.roles.remove(role, `Role remove via /role remove by ${interaction.user.username}`);
    return sendSuccess(ctx, `Removed <@&${role.id}> from **${targetUser.username}**.`);
  }

  // ── /role all ──────────────────────────────────────────────────────────────
  if (sub === 'all') {
    const role = interaction.options.getRole('role', true) as any;
    const err  = validateRoleForSlash(interaction.guild, role, invokerMember);
    if (err) {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      return sendError(ctx, err);
    }

    // Reply with the target selection panel then collect
    const token = `${interaction.id}-${Date.now()}`;
    await interaction.reply(
      buildRoleAllTargetPanel(role.name, role.id, interaction.guild.memberCount, token),
    );

    const panel = await interaction.fetchReply().catch((): null => null);
    if (!panel) return;

    const collector = panel.createMessageComponentCollector({
      filter: (i: any) => {
        if (!i.customId.startsWith('roleall:') || !i.customId.endsWith(`:${token}`)) return false;
        if (i.user.id !== interaction.user.id) {
          i.reply({ content: 'Only the person who ran this command can use this.', flags: MessageFlags.Ephemeral }).catch((): null => null);
          return false;
        }
        return true;
      },
      max:  1,
      time: 30_000,
    });

    collector.on('collect', async (i: any) => {
      await i.deferUpdate().catch((): null => null);
      const parts  = i.customId.split(':');
      const action = parts[1] as string;

      if (action === 'cancel') {
        await panel.edit(buildRoleAllCancelledPayload()).catch((): null => null);
        return;
      }

      const targetType = action as RoleAllTargetType;
      await panel.edit(buildRoleAllProgressPayload(role.name, targetType)).catch((): null => null);

      let members: Map<string, any>;
      let usingCache = false;
      try {
        members = await interaction.guild.members.fetch();
      } catch {
        members = interaction.guild.members.cache;
        usingCache = true;
      }

      const eligible = [...members.values()].filter((m: any) => {
        if (targetType === 'humans' && m.user.bot) return false;
        if (targetType === 'bots' && !m.user.bot) return false;
        return !m.roles.cache.has(role.id);
      });

      const skipped = [...members.values()].filter((m: any) => {
        if (targetType === 'humans' && m.user.bot) return false;
        if (targetType === 'bots' && !m.user.bot) return false;
        return m.roles.cache.has(role.id);
      }).length;

      let added = 0; let failed = 0;
      const reason = `roleall (${targetType}) via /role all by ${interaction.user.username}`;

      for (let idx = 0; idx < eligible.length; idx += BATCH_SIZE) {
        const batch = eligible.slice(idx, idx + BATCH_SIZE);
        await Promise.all(batch.map((m: any) =>
          m.roles.add(role, reason).then(() => { added++; }).catch(() => { failed++; }),
        ));
        if (idx + BATCH_SIZE < eligible.length)
          await new Promise<void>((r) => setTimeout(r, BATCH_DELAY_MS));
      }

      await panel.edit(buildRoleAllResultPayload(role.name, role.id, targetType, added, skipped, failed, usingCache)).catch((): null => null);
    });

    collector.on('end', async (_: any, reason: string) => {
      if (reason === 'time') await panel.edit(buildRoleAllTimedOutPayload()).catch((): null => null);
    });

    return;
  }
}
