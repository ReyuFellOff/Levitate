// xoxo/commands/moderation/warn.ts
//
// Warn a member. Warnings are persisted per-guild/per-user in the database
// and can be viewed with $warnings and cleared with $clearwarnings.
//
// Prefix:  $warn <@user|ID|username> <reason>
// Slash:   /warn user:<user> reason:<text>
//
// Checks:
//   • Invoker has ModerateMembers
//   • Target is not the invoker
//   • Target is not the server owner
//   • Target is not a bot developer

import { PermissionFlagsBits } from 'discord.js';
import type { LevitateClient } from '../../structures/LevitateClient.js';
import { sendError } from '../../components/statusMessages.js';
import { buildWarnSuccessPayload, buildWarnDmPayload } from '../../components/moderation/warn.js';
import { buildModLogWarn } from '../../components/moderation/modlog.js';
import { sendModLog } from '../../utils/modlogHelper.js';
import { resolveUser } from '../../helpers/userResolver.js';
import { sendInvokeResponse } from '../../helpers/invoke.js';

export const options = {
  name:        'warn',
  aliases:     [] as string[],
  description: 'Warn a member.',
  usage:       'warn <@user|ID|username> <reason>',
  category:    'moderation',
  owner:       false,
  cooldown:    3,
};

function checkTarget(guild: any, targetUser: any, invokerId: string, developers: [string, string][]): string | null {
  if (targetUser.id === invokerId)     return 'You cannot warn yourself.';
  if (targetUser.id === guild.ownerId) return 'You cannot warn the server owner.';
  if (targetUser.bot)                  return 'You cannot warn a bot.';
  if (developers.some(([, id]) => id === targetUser.id))
    return 'You cannot warn a bot developer.';
  return null;
}

export async function prefixExecute(
  message: any,
  args:    string[],
  client:  LevitateClient,
): Promise<any> {
  const ctx = { message };

  if (!message.guild) return sendError(ctx, 'This command can only be used in a server.');

  const invokerPerms = message.channel.permissionsFor?.(message.member);
  if (!invokerPerms?.has?.(PermissionFlagsBits.ModerateMembers))
    return sendError(ctx, 'You need the **Timeout Members** permission to use this command.');

  if (!args[0] || !args[1])
    return sendError(ctx, `**Usage:** \`${client.config.prefix}${options.usage}\``);

  const targetUser = await resolveUser(client, message.guild, args[0]);
  if (!targetUser) return sendError(ctx, `Could not find a user matching \`${args[0]}\`.`);

  const err = checkTarget(message.guild, targetUser, message.author.id, client.config.developers);
  if (err) return sendError(ctx, err);

  const reason = args.slice(1).join(' ').trim();

  await client.db.addWarning(message.guild.id, targetUser.id, reason, message.author.id);
  const count = await client.db.countWarnings(message.guild.id, targetUser.id);

  try {
    const dm = await targetUser.createDM();
    await dm.send(buildWarnDmPayload(message.guild.name, reason, message.author.username, count));
  } catch { /* DMs closed — non-fatal */ }

  const invoked = await sendInvokeResponse(
    { message },
    client,
    'warn',
    { targetUser, reason, count },
  );
  if (!invoked) {
    await message.channel.send(buildWarnSuccessPayload(targetUser, reason, message.author.username, count));
  }
  sendModLog(client, message.guild.id, buildModLogWarn(targetUser, reason, message.author.username, count));
}

export async function slashExecute(
  interaction: any,
  client:      LevitateClient,
): Promise<any> {
  await interaction.deferReply();
  const ctx = { interaction };

  if (!interaction.guild) return sendError(ctx, 'This command can only be used in a server.');

  const invokerMember = interaction.member;
  if (!invokerMember?.permissions?.has?.(PermissionFlagsBits.ModerateMembers))
    return sendError(ctx, 'You need the **Timeout Members** permission to use this command.');

  const targetUser = interaction.options.getUser('user', true);
  const reason     = interaction.options.getString('reason', true).trim();

  const err = checkTarget(interaction.guild, targetUser, interaction.user.id, client.config.developers);
  if (err) return sendError(ctx, err);

  await client.db.addWarning(interaction.guild.id, targetUser.id, reason, interaction.user.id);
  const count = await client.db.countWarnings(interaction.guild.id, targetUser.id);

  try {
    const dm = await targetUser.createDM();
    await dm.send(buildWarnDmPayload(interaction.guild.name, reason, interaction.user.username, count));
  } catch { /* DMs closed — non-fatal */ }

  const invoked = await sendInvokeResponse(
    { interaction },
    client,
    'warn',
    { targetUser, reason, count },
  );
  if (!invoked) {
    await interaction.editReply(buildWarnSuccessPayload(targetUser, reason, interaction.user.username, count));
  }
  sendModLog(client, interaction.guild.id, buildModLogWarn(targetUser, reason, interaction.user.username, count));
}
