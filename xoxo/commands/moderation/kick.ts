// xoxo/commands/moderation/kick.ts
//
// Kick a member from this server.
//
// Prefix:  $kick <@user|ID|username> [reason]
// Slash:   /kick user:<user> [reason]
//
// Checks (both paths):
//   • Invoker has KickMembers
//   • Bot has KickMembers
//   • Target is in the server (kick requires membership)
//   • Target is not the invoker
//   • Target is not the server owner
//   • Target is not a bot developer
//   • Role hierarchy — invoker and bot must outrank the target
//
// DM notification is attempted before the kick. Failure is non-fatal.

import { PermissionFlagsBits } from 'discord.js';
import type { LevitateClient } from '../../structures/LevitateClient.js';
import { sendError } from '../../components/statusMessages.js';
import { buildKickSuccessPayload, buildKickDmPayload } from '../../components/moderation/kick.js';
import { buildModLogKick } from '../../components/moderation/modlog.js';
import { sendModLog } from '../../utils/modlogHelper.js';
import { resolveUser } from '../../helpers/userResolver.js';
import { confirmSlashAction } from '../../components/moderation/actionConfirm.js';
import { sendInvokeResponse } from '../../helpers/invoke.js';

export const options = {
  name:        'kick',
  aliases:     [] as string[],
  description: 'Kick a member from this server.',
  usage:       'kick <@user|ID|username> [reason]',
  category:    'moderation',
  owner:       false,
  cooldown:    3,
};

// ─────────────────────────────────────────────────────────────────────────────
// Shared guard logic
// ─────────────────────────────────────────────────────────────────────────────

async function getMemberAndCheck(opts: {
  guild:         any;
  targetUser:    any;
  invokerId:     string;
  invokerMember: any;
  botMember:     any;
  developers:    [string, string][];
}): Promise<{ member: any } | { error: string }> {
  const { guild, targetUser, invokerId, invokerMember, botMember, developers } = opts;

  if (targetUser.id === invokerId)           return { error: 'You cannot kick yourself.' };
  if (targetUser.id === guild.ownerId)       return { error: 'You cannot kick the server owner.' };
  if (targetUser.id === botMember?.user?.id) return { error: 'I cannot kick myself.' };
  if (developers.some(([, id]) => id === targetUser.id))
    return { error: 'You cannot kick a bot developer.' };

  const targetMember = await guild.members.fetch(targetUser.id).catch((): null => null);
  if (!targetMember)
    return { error: `**${targetUser.username}** is not in this server — you cannot kick someone who isn't here.` };

  const invokerIsOwner = invokerId === guild.ownerId;
  const invokerTop     = invokerMember?.roles?.highest?.position ?? 0;
  const targetTop      = targetMember.roles?.highest?.position   ?? 0;
  const botTop         = botMember?.roles?.highest?.position     ?? 0;

  if (!invokerIsOwner && targetTop >= invokerTop)
    return { error: `You cannot kick **${targetUser.username}** — they have an equal or higher role than you.` };
  if (targetTop >= botTop)
    return { error: `I cannot kick **${targetUser.username}** — their role is equal to or higher than mine.` };
  if (!targetMember.kickable)
    return { error: `I cannot kick **${targetUser.username}** — missing permissions.` };

  return { member: targetMember };
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
  if (!invokerPerms?.has?.(PermissionFlagsBits.KickMembers))
    return sendError(ctx, 'You need the **Kick Members** permission to use this command.');

  const botMember = await message.guild.members.fetchMe().catch((): null => null);
  if (!botMember?.permissions?.has?.(PermissionFlagsBits.KickMembers))
    return sendError(ctx, 'I need the **Kick Members** permission to kick members.');

  if (!args[0]) return sendError(ctx, `**Usage:** \`${client.config.prefix}${options.usage}\``);

  const targetUser = await resolveUser(client, message.guild, args[0]);
  if (!targetUser) return sendError(ctx, `Could not find a user matching \`${args[0]}\`.`);

  const reason = args.slice(1).join(' ').trim() || 'No reason provided.';

  const result = await getMemberAndCheck({
    guild:         message.guild,
    targetUser,
    invokerId:     message.author.id,
    invokerMember: message.member,
    botMember,
    developers:    client.config.developers,
  });
  if ('error' in result) return sendError(ctx, result.error);

  let dmSent = false;
  try {
    const dm = await targetUser.createDM();
    await dm.send(buildKickDmPayload(message.guild.name, reason, message.author.username));
    dmSent = true;
  } catch { /* DMs closed — non-fatal */ }

  const kicked = await result.member.kick(reason).catch((err: any): null => {
    console.error(`[kick] failed to kick ${targetUser.id}: ${err?.message ?? err}`);
    return null;
  });
  if (!kicked)
    return sendError(ctx, `Failed to kick **${targetUser.username}**. Check my permissions and role position.`);

  const invoked = await sendInvokeResponse(
    { message },
    client,
    'kick',
    { targetUser, reason },
  );
  if (!invoked) {
    await message.channel.send(buildKickSuccessPayload(targetUser, reason, message.author.username, dmSent));
  }
  sendModLog(client, message.guild.id, buildModLogKick(targetUser, reason, message.author.username, dmSent));
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
  if (!invokerMember?.permissions?.has?.(PermissionFlagsBits.KickMembers))
    return sendError(ctx, 'You need the **Kick Members** permission to use this command.');

  const botMember = await interaction.guild.members.fetchMe().catch((): null => null);
  if (!botMember?.permissions?.has?.(PermissionFlagsBits.KickMembers))
    return sendError(ctx, 'I need the **Kick Members** permission to kick members.');

  const targetUser = interaction.options.getUser('user', true);
  const reason     = (interaction.options.getString('reason') ?? 'No reason provided.').trim();

  const result = await getMemberAndCheck({
    guild:         interaction.guild,
    targetUser,
    invokerId:     interaction.user.id,
    invokerMember,
    botMember,
    developers:    client.config.developers,
  });
  if ('error' in result) return sendError(ctx, result.error);

  await confirmSlashAction({
    interaction,
    title:       'Confirm Kick',
    description: `Are you sure you want to kick **${targetUser.username}**?\n-# Reason: ${reason}`,
    onConfirm: async () => {
      let dmSent = false;
      try {
        const dm = await targetUser.createDM();
        await dm.send(buildKickDmPayload(interaction.guild.name, reason, interaction.user.username));
        dmSent = true;
      } catch { /* DMs closed — non-fatal */ }

      const kicked = await result.member.kick(reason).catch((err: any): null => {
        console.error(`[kick] failed to kick ${targetUser.id}: ${err?.message ?? err}`);
        return null;
      });
      if (!kicked) {
        await sendError(ctx, `Failed to kick **${targetUser.username}**. Check my permissions and role position.`);
        return;
      }

      const invoked = await sendInvokeResponse(
        { interaction },
        client,
        'kick',
        { targetUser, reason },
      );
      if (!invoked) {
        await interaction.editReply(buildKickSuccessPayload(targetUser, reason, interaction.user.username, dmSent));
      }
      sendModLog(client, interaction.guild.id, buildModLogKick(targetUser, reason, interaction.user.username, dmSent));
    },
  });
}
