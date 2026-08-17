// xoxo/commands/moderation/ban.ts
//
// Ban a user from this server.
//
// Prefix:  $ban <@user|ID|username> [reason]
// Slash:   /ban user:<user> [reason] [delete_days:0-7]
//
// Checks (both paths):
//   • Invoker has BanMembers
//   • Bot has BanMembers
//   • Target is not the invoker
//   • Target is not the server owner
//   • Target is not a bot developer
//   • Bot can action the target (role hierarchy)
//
// DM notification is attempted before the ban. Failure is noted but non-fatal.

import { PermissionFlagsBits } from 'discord.js';
import type { LevitateClient } from '../../structures/LevitateClient.js';
import { sendError } from '../../components/statusMessages.js';
import { buildBanSuccessPayload, buildBanDmPayload } from '../../components/moderation/ban.js';
import { buildModLogBan } from '../../components/moderation/modlog.js';
import { sendModLog } from '../../utils/modlogHelper.js';
import { resolveUser } from '../../helpers/userResolver.js';
import { confirmSlashAction } from '../../components/moderation/actionConfirm.js';
import { sendInvokeResponse } from '../../helpers/invoke.js';

export const options = {
  name:        'ban',
  aliases:     [] as string[],
  description: 'Ban a user from this server.',
  usage:       'ban <@user|ID|username> [reason]',
  category:    'moderation',
  owner:       false,
  cooldown:    3,
};

// ─────────────────────────────────────────────────────────────────────────────
// Shared guard logic
// ─────────────────────────────────────────────────────────────────────────────

async function runChecks(opts: {
  guild:         any;
  targetUser:    any;
  invokerId:     string;
  invokerMember: any;
  botMember:     any;
  developers:    [string, string][];
}): Promise<string | null> {
  const { guild, targetUser, invokerId, invokerMember, botMember, developers } = opts;

  if (targetUser.id === invokerId)           return 'You cannot ban yourself.';
  if (targetUser.id === guild.ownerId)       return 'You cannot ban the server owner.';
  if (targetUser.id === botMember?.user?.id) return 'I cannot ban myself.';
  if (developers.some(([, id]) => id === targetUser.id))
    return 'You cannot ban a bot developer.';

  const targetMember = await guild.members.fetch(targetUser.id).catch((): null => null);
  if (!targetMember)
    return `**${targetUser.username}** is not a member of this server. Use \`hackban\` to ban users who are not in the server.`;
  const invokerIsOwner = invokerId === guild.ownerId;
  const invokerTop     = invokerMember?.roles?.highest?.position ?? 0;
  const targetTop      = targetMember.roles?.highest?.position   ?? 0;
  const botTop         = botMember?.roles?.highest?.position     ?? 0;
  if (!invokerIsOwner && targetTop >= invokerTop)
    return `You cannot ban **${targetUser.username}** — they have an equal or higher role than you.`;
  if (targetTop >= botTop)
    return `I cannot ban **${targetUser.username}** — their role is equal to or higher than mine.`;
  if (!targetMember.bannable)
    return `I cannot ban **${targetUser.username}** — missing permissions.`;

  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Prefix
// ─────────────────────────────────────────────────────────────────────────────

export async function prefixExecute(
  message: any,
  args:    string[],
  client:  LevitateClient,
): Promise<any> {
  const ctx = { message };

  if (!message.guild) return sendError(ctx, 'This command can only be used in a server.');

  const invokerPerms = message.channel.permissionsFor?.(message.member);
  if (!invokerPerms?.has?.(PermissionFlagsBits.BanMembers))
    return sendError(ctx, 'You need the **Ban Members** permission to use this command.');

  const botMember = await message.guild.members.fetchMe().catch((): null => null);
  if (!botMember?.permissions?.has?.(PermissionFlagsBits.BanMembers))
    return sendError(ctx, 'I need the **Ban Members** permission to ban members.');

  if (!args[0])
    return sendError(ctx, `**Usage:** \`${client.config.prefix}${options.usage}\``);

  const targetUser = await resolveUser(client, message.guild, args[0]);
  if (!targetUser) return sendError(ctx, `Could not find a user matching \`${args[0]}\`.`);

  const reason = args.slice(1).join(' ').trim() || 'No reason provided.';

  const err = await runChecks({
    guild:         message.guild,
    targetUser,
    invokerId:     message.author.id,
    invokerMember: message.member,
    botMember,
    developers:    client.config.developers,
  });
  if (err) return sendError(ctx, err);

  let dmSent = false;
  try {
    const dm = await targetUser.createDM();
    await dm.send(buildBanDmPayload(message.guild.name, reason, message.author.username));
    dmSent = true;
  } catch { /* DMs closed — non-fatal */ }

  const banned = await message.guild.members
    .ban(targetUser.id, { reason, deleteMessageSeconds: 0 })
    .catch((err: any): null => {
      console.error(`[ban] failed to ban ${targetUser.id}: ${err?.message ?? err}`);
      return null;
    });

  if (!banned)
    return sendError(ctx, `Failed to ban **${targetUser.username}**. Check my permissions and role position.`);

  const invoked = await sendInvokeResponse(
    { message },
    client,
    'ban',
    { targetUser, reason },
  );
  if (!invoked) {
    await message.channel.send(buildBanSuccessPayload(targetUser, reason, 0, message.author.username, dmSent));
  }
  sendModLog(client, message.guild.id, buildModLogBan(targetUser, reason, message.author.username, 0, dmSent));
}

// ─────────────────────────────────────────────────────────────────────────────
// Slash
// ─────────────────────────────────────────────────────────────────────────────

export async function slashExecute(
  interaction: any,
  client:      LevitateClient,
): Promise<any> {
  await interaction.deferReply();
  const ctx = { interaction };

  if (!interaction.guild) return sendError(ctx, 'This command can only be used in a server.');

  const invokerMember = interaction.member;
  if (!invokerMember?.permissions?.has?.(PermissionFlagsBits.BanMembers))
    return sendError(ctx, 'You need the **Ban Members** permission to use this command.');

  const botMember = await interaction.guild.members.fetchMe().catch((): null => null);
  if (!botMember?.permissions?.has?.(PermissionFlagsBits.BanMembers))
    return sendError(ctx, 'I need the **Ban Members** permission to ban members.');

  const targetUser = interaction.options.getUser('user', true);
  const reason     = (interaction.options.getString('reason') ?? 'No reason provided.').trim();
  const deleteDays = interaction.options.getInteger('delete_days') ?? 0;

  const err = await runChecks({
    guild:         interaction.guild,
    targetUser,
    invokerId:     interaction.user.id,
    invokerMember,
    botMember,
    developers:    client.config.developers,
  });
  if (err) return sendError(ctx, err);

  await confirmSlashAction({
    interaction,
    title:       'Confirm Ban',
    description: `Are you sure you want to ban **${targetUser.username}**?\n-# Reason: ${reason}`,
    onConfirm: async () => {
      let dmSent = false;
      try {
        const dm = await targetUser.createDM();
        await dm.send(buildBanDmPayload(interaction.guild.name, reason, interaction.user.username));
        dmSent = true;
      } catch { /* DMs closed — non-fatal */ }

      const banned = await interaction.guild.members
        .ban(targetUser.id, { reason, deleteMessageSeconds: deleteDays * 86_400 })
        .catch((err: any): null => {
          console.error(`[ban] failed to ban ${targetUser.id}: ${err?.message ?? err}`);
          return null;
        });

      if (!banned) {
        await sendError(ctx, `Failed to ban **${targetUser.username}**. Check my permissions and role position.`);
        return;
      }

      const invoked = await sendInvokeResponse(
        { interaction },
        client,
        'ban',
        { targetUser, reason },
      );
      if (!invoked) {
        await interaction.editReply(buildBanSuccessPayload(targetUser, reason, deleteDays, interaction.user.username, dmSent));
      }
      sendModLog(client, interaction.guild.id, buildModLogBan(targetUser, reason, interaction.user.username, deleteDays, dmSent));
    },
  });
}
