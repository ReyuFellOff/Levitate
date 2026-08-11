// xoxo/commands/moderation/jail.ts
//
// Configure the server jail and jail a member.
//
// Prefix:
//   $jail setup [#allowed-channel]
//   $jail remove
//   $jail list
//   $jail status
//   $jail commands
//   $jail <@user|ID|username> [reason]
//
// Slash:
//   /jail setup [allowed_channel]
//   /jail remove
//   /jail list
//   /jail status
//   /jail commands
//   /jail add user [reason]

import { PermissionFlagsBits } from 'discord.js';
import type { LevitateClient } from '../../structures/LevitateClient.js';
import { sendError, sendInfo, sendLoading, sendSuccess } from '../../components/statusMessages.js';
import { resolveUser } from '../../helpers/userResolver.js';
import { sendInvokeResponse } from '../../helpers/invoke.js';
import {
  configureJail,
  getJailedMembers,
  getConfiguredJailRole,
  getGuildBotMember,
  hasJailMemberPermission,
  hasJailSetupPermissions,
  jailRoleMention,
  removeJailSetup,
  validateJailTarget,
} from '../../helpers/jail.js';

export const options = {
  name:        'jail',
  aliases:     [] as string[],
  description: 'Configure jail, list jailed members, or view jail access rules.',
  usage:       'jail setup [#allowed-channel]\njail remove\njail list\njail status\njail commands\njail <@user|ID|username> [reason]',
  category:    'moderation',
  owner:       false,
  cooldown:    5,
};

function resolveAllowedChannel(guild: any, message: any, arg?: string): any | null {
  if (!arg) return null;
  const mention = message.mentions?.channels?.first?.();
  if (mention) return mention.guild?.id === guild.id ? mention : null;

  const id = arg.match(/^(?:<#)?(\d{17,20})>?$/)?.[1];
  if (id) return guild.channels.cache.get(id) ?? null;

  const lower = arg.toLowerCase();
  return guild.channels.cache.find((channel: any) => channel.name?.toLowerCase() === lower) ?? null;
}

async function runSetup(
  context: { message?: any; interaction?: any },
  client: LevitateClient,
  allowedChannel: any | null,
): Promise<any> {
  const guild = context.message?.guild ?? context.interaction?.guild;
  const actor = context.message?.author ?? context.interaction?.user;
  const ctx = context.message ? { message: context.message } : { interaction: context.interaction };

  if (!guild) return sendError(ctx, 'This command can only be used in a server.');
  if (!client.db) return sendError(ctx, 'Database is unavailable right now.');

  const member = context.message?.member ?? context.interaction?.member;
  if (!hasJailSetupPermissions(member)) {
    return sendError(ctx, 'You need **Manage Roles** and **Manage Channels** permissions to configure jail.');
  }

  const botMember = getGuildBotMember(guild) ??
    await guild.members.fetchMe().catch((): null => null);
  if (!botMember?.permissions?.has?.(PermissionFlagsBits.ManageRoles) ||
      !botMember?.permissions?.has?.(PermissionFlagsBits.ManageChannels)) {
    return sendError(ctx, 'I need **Manage Roles** and **Manage Channels** permissions to configure jail.');
  }

  if (allowedChannel && (!allowedChannel.guild || allowedChannel.guild.id !== guild.id)) {
    return sendError(ctx, 'The allowed channel must belong to this server.');
  }

  const loadingMessage = await sendLoading(ctx, 'Configuring jail across the server… Please wait.');
  const resultContext = context.message && loadingMessage
    ? { message: context.message, existingMessage: loadingMessage }
    : ctx;

  let result:
    | Awaited<ReturnType<typeof configureJail>>
    | { error: string };
  try {
    result = await configureJail(
      guild,
      client,
      allowedChannel?.id ?? null,
      `Jail setup by ${actor?.username ?? actor?.id ?? 'moderator'}`,
    );
  } catch (err: any) {
    console.error(`[jail] setup failed in ${guild.id}: ${err?.message ?? err}`);
    return sendError(resultContext, 'Jail setup failed unexpectedly. Please check my permissions and try again.');
  }
  if ('error' in result) return sendError(resultContext, result.error);

  const warning = result.failedChannels.length
    ? `\nI could not update: ${result.failedChannels.join(', ')}. Run setup again after fixing my channel permissions.`
    : '';
  const allowedText = allowedChannel
    ? ` Jailed members can use <#${allowedChannel.id}>.`
    : ' Jailed members cannot view or send messages in any channel.';

  return sendSuccess(
    resultContext,
    `Jail is configured with ${jailRoleMention(result.role)} across **${result.channelCount}** channel(s).${allowedText}${warning}`,
  );
}

async function runRemove(
  context: { message?: any; interaction?: any },
  client: LevitateClient,
): Promise<any> {
  const guild = context.message?.guild ?? context.interaction?.guild;
  const member = context.message?.member ?? context.interaction?.member;
  const ctx = context.message ? { message: context.message } : { interaction: context.interaction };

  if (!guild) return sendError(ctx, 'This command can only be used in a server.');
  if (!client.db) return sendError(ctx, 'Database is unavailable right now.');
  if (!hasJailSetupPermissions(member)) {
    return sendError(ctx, 'You need **Manage Roles** and **Manage Channels** permissions to remove jail setup.');
  }

  const botMember = getGuildBotMember(guild) ??
    await guild.members.fetchMe().catch((): null => null);
  if (!botMember?.permissions?.has?.(PermissionFlagsBits.ManageRoles) ||
      !botMember?.permissions?.has?.(PermissionFlagsBits.ManageChannels)) {
    return sendError(ctx, 'I need **Manage Roles** and **Manage Channels** permissions to remove jail setup.');
  }

  const loadingMessage = await sendLoading(ctx, 'Removing jail setup, role, and channel permissions… Please wait.');
  const resultContext = context.message && loadingMessage
    ? { message: context.message, existingMessage: loadingMessage }
    : ctx;
  let result:
    | Awaited<ReturnType<typeof removeJailSetup>>
    | { error: string };
  try {
    result = await removeJailSetup(
      guild,
      client,
      `Jail setup removed by ${context.message?.author?.username ?? context.interaction?.user?.username ?? 'moderator'}`,
    );
  } catch (err: any) {
    console.error(`[jail] removal failed in ${guild.id}: ${err?.message ?? err}`);
    return sendError(resultContext, 'Removing jail setup failed unexpectedly. Please check my permissions and try again.');
  }

  if ('error' in result) return sendError(resultContext, result.error);

  const warning = result.failedChannels.length
    ? ` I could not directly remove overwrites from: ${result.failedChannels.join(', ')}; deleting the role removed its remaining permissions.`
    : '';
  const roleText = result.role ? ` Deleted ${jailRoleMention(result.role)}.` : ' The configured role was already missing.';

  return sendSuccess(
    resultContext,
    `Jail setup removed.${roleText} Removed **${result.removedOverwrites}** channel permission overwrite(s).${warning}`,
  );
}

async function runJail(
  context: { message?: any; interaction?: any },
  client: LevitateClient,
  targetUser: any,
  reason: string,
): Promise<any> {
  const guild = context.message?.guild ?? context.interaction?.guild;
  const actor = context.message?.author ?? context.interaction?.user;
  const invokerMember = context.message?.member ?? context.interaction?.member;
  const ctx = context.message ? { message: context.message } : { interaction: context.interaction };

  if (!guild) return sendError(ctx, 'This command can only be used in a server.');
  if (!hasJailMemberPermission(invokerMember)) {
    return sendError(ctx, 'You need the **Manage Roles** permission to jail members.');
  }

  const setup = await getConfiguredJailRole(guild, client);
  if (!setup) return sendError(ctx, 'Jail is not configured. Use `jail setup [#allowed-channel]` first.');

  const botMember = getGuildBotMember(guild) ??
    await guild.members.fetchMe().catch((): null => null);
  if (!botMember?.permissions?.has?.(PermissionFlagsBits.ManageRoles)) {
    return sendError(ctx, 'I need the **Manage Roles** permission to jail members.');
  }

  const result = await validateJailTarget({
    guild,
    targetUser,
    invokerMember,
    botMember,
    developers: client.config.developers,
    action: 'jail',
  });
  if ('error' in result) return sendError(ctx, result.error);
  if (result.member.roles.cache.has(setup.role.id)) {
    return sendInfo(ctx, `**${targetUser.username}** is already jailed.`);
  }

  const added = await result.member.roles.add(setup.role, reason).catch((err: any): null => {
    console.error(`[jail] failed to jail ${targetUser.id}: ${err?.message ?? err}`);
    return null;
  });
  if (!added) return sendError(ctx, `Failed to jail **${targetUser.username}**.`);

  const invoked = await sendInvokeResponse(
    context,
    client,
    'jail',
    { targetUser, reason },
  );
  if (invoked) return;
  return sendSuccess(ctx, `Jailed **${targetUser.username}** with ${jailRoleMention(setup.role)}. Reason: ${reason}.`);
}

async function runJailInfo(
  context: { message?: any; interaction?: any },
  client: LevitateClient,
  action: 'list' | 'status' | 'commands',
): Promise<any> {
  const guild = context.message?.guild ?? context.interaction?.guild;
  const member = context.message?.member ?? context.interaction?.member;
  const ctx = context.message ? { message: context.message } : { interaction: context.interaction };

  if (!guild) return sendError(ctx, 'This command can only be used in a server.');

  // A member list is moderation information. Status/commands is intentionally
  // readable by everyone so jailed members can understand their own access.
  if (action === 'list' && !hasJailMemberPermission(member ?? context.interaction?.member)) {
    return sendError(ctx, 'You need the **Manage Roles** permission to list jailed members.');
  }

  const setup = await getConfiguredJailRole(guild, client);
  if (!setup) return sendError(ctx, 'Jail is not configured. Use `jail setup [#allowed-channel]` first.');

  if (action === 'list') {
    const jailedMembers = await getJailedMembers(guild, setup.role);
    if (!jailedMembers.length) {
      return sendInfo(ctx, `No members are currently jailed with ${jailRoleMention(setup.role)}.`);
    }

    const lines = jailedMembers.map((jailedMember: any, index: number) =>
      `${index + 1}. <@${jailedMember.id}> — \`${jailedMember.user?.username ?? jailedMember.id}\``,
    );
    const visibleLines = lines.slice(0, 70);
    const remainder = lines.length - visibleLines.length;
    const suffix = remainder > 0
      ? `\n…and **${remainder}** more.`
      : '';

    return sendInfo(
      ctx,
      `**Jailed members (${jailedMembers.length})** — ${jailRoleMention(setup.role)}\n` +
      visibleLines.join('\n') +
      suffix,
    );
  }

  const allowedChannelId = setup.config.allowed_channel_id;
  const allowedChannel = allowedChannelId
    ? guild.channels.cache.get(allowedChannelId) ??
      await guild.channels.fetch(allowedChannelId).catch((): null => null)
    : null;
  const allowedChannelText = allowedChannel
    ? `<#${allowedChannel.id}>`
    : allowedChannelId
      ? `Unavailable/deleted channel (\`${allowedChannelId}\`)`
      : '**none**';

  return sendInfo(
    ctx,
    `**Jail access**\n` +
    `• Role: ${jailRoleMention(setup.role)}\n` +
    `• Allowed channel: ${allowedChannelText}\n` +
    `• Jailed members may view and send messages only in the allowed channel.\n` +
    `• Commands are not separately allowlisted: jailed members can use commands in that channel only when the command's normal permissions allow it.\n` +
    `• There are currently **no special commands granted to jailed members**. Moderators can use \`jail list\`, \`jail status\`, and \`unjail\` as normal.`,
  );
}

export async function prefixExecute(
  message: any,
  args: string[],
  client: LevitateClient,
): Promise<any> {
  if (args[0]?.toLowerCase() === 'setup') {
    if (!message.guild) return sendError({ message }, 'This command can only be used in a server.');
    const channel = resolveAllowedChannel(message.guild, message, args[1]);
    if (args[1] && !channel) {
      return sendError({ message }, `Could not find a channel matching \`${args[1]}\`.`);
    }
    return runSetup({ message }, client, channel);
  }

  if (args[0]?.toLowerCase() === 'remove') {
    return runRemove({ message }, client);
  }

  const infoAction = args[0]?.toLowerCase();
  if (infoAction === 'list' || infoAction === 'status' || infoAction === 'commands') {
    return runJailInfo({ message }, client, infoAction);
  }

  if (!args[0]) return sendError({ message }, `**Usage:**\n\`\`\`\n${options.usage}\n\`\`\``);
  const targetUser = await resolveUser(client, message.guild, args[0]);
  if (!targetUser) return sendError({ message }, `Could not find a user matching \`${args[0]}\`.`);
  return runJail({ message }, client, targetUser, args.slice(1).join(' ').trim() || 'No reason provided.');
}

export async function slashExecute(interaction: any, client: LevitateClient): Promise<any> {
  await interaction.deferReply();
  const subcommand = interaction.options.getSubcommand();

  if (subcommand === 'setup') {
    return runSetup({ interaction }, client, interaction.options.getChannel('allowed_channel') ?? null);
  }

  if (subcommand === 'remove') {
    return runRemove({ interaction }, client);
  }

  if (subcommand === 'list' || subcommand === 'status' || subcommand === 'commands') {
    return runJailInfo({ interaction }, client, subcommand);
  }

  const targetUser = interaction.options.getUser('user', true);
  const reason = (interaction.options.getString('reason') ?? 'No reason provided.').trim();
  return runJail({ interaction }, client, targetUser, reason);
}