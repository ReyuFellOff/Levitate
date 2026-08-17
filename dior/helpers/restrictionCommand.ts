import type { LevitateClient } from '../structures/LevitateClient.js';
import { sendError, sendSuccess } from '../components/statusMessages.js';
import {
  getMemberRestrictions,
  setMemberRestriction,
  syncReactionOverwrite,
  validateRestrictionTarget,
  type RestrictionKind,
} from './memberRestrictions.js';
import { buildModLogMemberRestriction } from '../components/moderation/modlog.js';
import { sendModLog } from '../utils/modlogHelper.js';

export async function executeRestrictionCommand(opts: {
  ctx: { message?: any; interaction?: any };
  guild: any;
  targetUser: any;
  invokerMember: any;
  invokerId: string;
  botMember: any;
  client: LevitateClient;
  kind: RestrictionKind;
  enabled: boolean;
  reason: string;
}): Promise<any> {
  const {
    ctx, guild, targetUser, invokerMember, invokerId, botMember,
    client, kind, enabled, reason,
  } = opts;

  const result = await validateRestrictionTarget({
    guild,
    targetUser,
    invokerId,
    invokerMember,
    botMember,
    developers: client.config.developers,
  });
  if ('error' in result) return sendError(ctx, result.error);

  const previous = await getMemberRestrictions(client, guild.id, targetUser.id);
  const field = kind === 'image' ? 'image_muted' : 'reaction_muted';
  if (!enabled && !previous?.[field]) {
    return sendError(ctx, `**${targetUser.username}** is not currently ${kind}-muted.`);
  }

  const saved = await setMemberRestriction(
    client,
    guild.id,
    targetUser.id,
    kind,
    enabled,
    reason,
    invokerId,
  );
  if (!saved) return sendError(ctx, 'I could not save this moderation restriction. Please try again.');

  let channelNote = '';
  if (kind === 'reaction') {
    const synced = await syncReactionOverwrite(guild, result.member, botMember, enabled);
    if (synced.skipped > 0) {
      channelNote = `\n-# Enforcement is active globally; ${synced.skipped} channel${synced.skipped === 1 ? '' : 's'} could not receive a permission overwrite.`;
    }
  }

  const action = enabled ? `${kind}-muted` : `${kind}-unmuted`;
  sendModLog(
    client,
    guild.id,
    buildModLogMemberRestriction(targetUser, kind, enabled, reason, invokerMember?.user?.username ?? invokerMember?.user?.tag ?? 'Unknown'),
  );
  return sendSuccess(
    ctx,
    `**${targetUser.username}** has been **${action}**.${reason ? `\n-# Reason: ${reason}` : ''}${channelNote}`,
  );
}

export async function runPrefixRestriction(opts: {
  message: any;
  args: string[];
  client: LevitateClient;
  kind: RestrictionKind;
  enabled: boolean;
}): Promise<any> {
  const { message, args, client, kind, enabled } = opts;
  const ctx = { message };
  if (!message.guild) return sendError(ctx, 'This command can only be used in a server.');
  if (!message.channel.permissionsFor?.(message.member)?.has?.('ManageRoles')) {
    return sendError(ctx, 'You need the **Manage Roles** permission to use this command.');
  }

  const botMember = await message.guild.members.fetchMe().catch((): null => null);
  if (!botMember?.permissions?.has?.('ManageRoles')) {
    return sendError(ctx, 'I need the **Manage Roles** permission to use this command.');
  }
  if (!message.channel.permissionsFor?.(botMember)?.has?.('ManageMessages')) {
    return sendError(ctx, 'I need **Manage Messages** in this channel to enforce member content restrictions.');
  }
  if (!args[0]) {
    return sendError(ctx, `**Usage:** \`${client.config.prefix}${kind}${enabled ? 'mute' : 'unmute'} <@user|ID|username> [reason]\``);
  }

  const { resolveUser } = await import('./userResolver.js');
  const targetUser = await resolveUser(client, message.guild, args[0]);
  if (!targetUser) return sendError(ctx, `Could not find a user matching \`${args[0]}\`.`);

  return executeRestrictionCommand({
    ctx,
    guild: message.guild,
    targetUser,
    invokerMember: message.member,
    invokerId: message.author.id,
    botMember,
    client,
    kind,
    enabled,
    reason: args.slice(1).join(' ').trim() || 'No reason provided.',
  });
}

export async function runSlashRestriction(opts: {
  interaction: any;
  client: LevitateClient;
  kind: RestrictionKind;
  enabled: boolean;
}): Promise<any> {
  const { interaction, client, kind, enabled } = opts;
  await interaction.deferReply();
  const ctx = { interaction };
  if (!interaction.guild) return sendError(ctx, 'This command can only be used in a server.');
  if (!interaction.member?.permissions?.has?.('ManageRoles')) {
    return sendError(ctx, 'You need the **Manage Roles** permission to use this command.');
  }

  const botMember = await interaction.guild.members.fetchMe().catch((): null => null);
  if (!botMember?.permissions?.has?.('ManageRoles')) {
    return sendError(ctx, 'I need the **Manage Roles** permission to use this command.');
  }
  if (!interaction.channel?.permissionsFor?.(botMember)?.has?.('ManageMessages')) {
    return sendError(ctx, 'I need **Manage Messages** in this channel to enforce member content restrictions.');
  }
  const targetUser = interaction.options.getUser('user', true);
  const reason = (interaction.options.getString('reason') ?? 'No reason provided.').trim();

  return executeRestrictionCommand({
    ctx,
    guild: interaction.guild,
    targetUser,
    invokerMember: interaction.member,
    invokerId: interaction.user.id,
    botMember,
    client,
    kind,
    enabled,
    reason,
  });
}