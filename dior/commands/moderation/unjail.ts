// xoxo/commands/moderation/unjail.ts
//
// Remove the configured Jailed role from a member.
//
// Prefix: $unjail <@user|ID|username> [reason]
// Slash:  /unjail user [reason]

import type { LevitateClient } from '../../structures/LevitateClient.js';
import { PermissionFlagsBits } from 'discord.js';
import { sendError, sendInfo, sendSuccess } from '../../components/statusMessages.js';
import { resolveUser } from '../../helpers/userResolver.js';
import { sendInvokeResponse } from '../../helpers/invoke.js';
import {
  getConfiguredJailRole,
  getGuildBotMember,
  hasJailMemberPermission,
  jailRoleMention,
  validateJailTarget,
} from '../../helpers/jail.js';

export const options = {
  name:        'unjail',
  aliases:     [] as string[],
  description: 'Remove the Jailed role from a member.',
  usage:       'unjail <@user|ID|username> [reason]',
  category:    'moderation',
  owner:       false,
  cooldown:    5,
};

export async function prefixExecute(
  message: any,
  args: string[],
  client: LevitateClient,
): Promise<any> {
  const ctx = { message };
  if (!message.guild) return sendError(ctx, 'This command can only be used in a server.');
  if (!hasJailMemberPermission(message.member)) {
    return sendError(ctx, 'You need the **Manage Roles** permission to unjail members.');
  }
  if (!args[0]) return sendError(ctx, `**Usage:**\n\`\`\`\n${options.usage}\n\`\`\``);

  const targetUser = await resolveUser(client, message.guild, args[0]);
  if (!targetUser) return sendError(ctx, `Could not find a user matching \`${args[0]}\`.`);

  return runUnjail(
    { message },
    client,
    targetUser,
    args.slice(1).join(' ').trim() || 'No reason provided.',
  );
}

async function runUnjail(
  context: { message?: any; interaction?: any },
  client: LevitateClient,
  targetUser: any,
  reason: string,
): Promise<any> {
  const guild = context.message?.guild ?? context.interaction?.guild;
  const invokerMember = context.message?.member ?? context.interaction?.member;
  const ctx = context.message ? { message: context.message } : { interaction: context.interaction };

  if (!guild) return sendError(ctx, 'This command can only be used in a server.');

  const setup = await getConfiguredJailRole(guild, client);
  if (!setup) return sendError(ctx, 'Jail is not configured. Use `jail setup [#allowed-channel]` first.');

  const botMember = getGuildBotMember(guild) ??
    await guild.members.fetchMe().catch((): null => null);
  if (!botMember?.permissions?.has?.(PermissionFlagsBits.ManageRoles)) {
    return sendError(ctx, 'I need the **Manage Roles** permission to unjail members.');
  }

  const result = await validateJailTarget({
    guild,
    targetUser,
    invokerMember,
    botMember,
    developers: client.config.developers,
    action: 'unjail',
  });
  if ('error' in result) return sendError(ctx, result.error);
  if (!result.member.roles.cache.has(setup.role.id)) {
    return sendInfo(ctx, `**${targetUser.username}** is not jailed.`);
  }

  const removed = await result.member.roles.remove(setup.role, reason).catch((err: any): null => {
    console.error(`[unjail] failed to unjail ${targetUser.id}: ${err?.message ?? err}`);
    return null;
  });
  if (!removed) return sendError(ctx, `Failed to unjail **${targetUser.username}**.`);

  const invoked = await sendInvokeResponse(ctx, client, 'unjail', { targetUser, reason });
  if (invoked) return;
  return sendSuccess(ctx, `Unjailed **${targetUser.username}** and removed ${jailRoleMention(setup.role)}. Reason: ${reason}.`);
}

export async function slashExecute(interaction: any, client: LevitateClient): Promise<any> {
  await interaction.deferReply();
  const targetUser = interaction.options.getUser('user', true);
  const reason = (interaction.options.getString('reason') ?? 'No reason provided.').trim();
  return runUnjail({ interaction }, client, targetUser, reason);
}