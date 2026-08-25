// xoxo/commands/moderation/mute.ts
//
// Timeout (or un-timeout) a member in this server.
//
// Prefix:  $mute <@user|ID|username> <duration|remove> [reason]
//          Duration examples: 10s, 5m, 1h, 12h, 1d, 7d, 28d
//          Use "remove" or "off" to clear an active timeout.
// Slash:   /mute add  user duration [reason]
//          /mute remove user [reason]
//
// Checks:
//   • Invoker has ModerateMembers
//   • Bot has ModerateMembers
//   • Target is in the server
//   • Target is not the invoker
//   • Target is not the server owner
//   • Target is not a bot developer
//   • Role hierarchy — invoker and bot must outrank the target
//   • Max timeout duration: 28 days (Discord limit)
//
// DM notification is attempted before the action. Failure is non-fatal.

import { PermissionFlagsBits } from 'discord.js';
import type { CassieClient } from '../../structures/CassieClient.js';
import { sendError } from '../../components/statusMessages.js';
import {
  buildTimeoutAddPayload,
  buildTimeoutRemovePayload,
  buildTimeoutAddDmPayload,
  buildTimeoutRemoveDmPayload,
} from '../../components/moderation/timeout.js';
import { buildModLogTimeout, buildModLogUnTimeout } from '../../components/moderation/modlog.js';
import { sendModLog } from '../../utils/modlogHelper.js';
import { resolveUser } from '../../helpers/userResolver.js';
import { parseDuration } from '../../helpers/parseDuration.js';
import { confirmSlashAction } from '../../components/moderation/actionConfirm.js';
import { sendInvokeResponse } from '../../helpers/invoke.js';

export const options = {
  name:        'mute',
  aliases:     ['timeout'] as string[],
  description: 'Timeout or un-timeout a member.',
  usage:       'mute <@user|ID|username> <duration|remove> [reason]\n' +
               'Duration: 10s · 5m · 1h · 12h · 1d · 7d · 28d (max)\n' +
               'Remove: use "remove" or "off" to lift a timeout.',
  category:    'moderation',
  owner:       false,
  cooldown:    3,
};

const MAX_TIMEOUT_MS = 28 * 24 * 60 * 60 * 1_000; // 28 days

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

  if (targetUser.id === invokerId)           return { error: 'You cannot timeout yourself.' };
  if (targetUser.id === guild.ownerId)       return { error: 'You cannot timeout the server owner.' };
  if (targetUser.id === botMember?.user?.id) return { error: 'I cannot timeout myself.' };
  if (developers.some(([, id]) => id === targetUser.id))
    return { error: 'You cannot timeout a bot developer.' };

  const targetMember = await guild.members.fetch(targetUser.id).catch((): null => null);
  if (!targetMember)
    return { error: `**${targetUser.username}** is not in this server.` };

  const invokerIsOwner = invokerId === guild.ownerId;
  const invokerTop     = invokerMember?.roles?.highest?.position ?? 0;
  const targetTop      = targetMember.roles?.highest?.position   ?? 0;
  const botTop         = botMember?.roles?.highest?.position     ?? 0;

  if (!invokerIsOwner && targetTop >= invokerTop)
    return { error: `You cannot timeout **${targetUser.username}** — they have an equal or higher role than you.` };
  if (targetTop >= botTop)
    return { error: `I cannot timeout **${targetUser.username}** — their role is equal to or higher than mine.` };
  if (!targetMember.moderatable)
    return { error: `I cannot timeout **${targetUser.username}** — missing permissions.` };

  return { member: targetMember };
}

// ─────────────────────────────────────────────────────────────────────────────
// Prefix
// ─────────────────────────────────────────────────────────────────────────────

export async function prefixExecute(
  message: any,
  args:    string[],
  client:  CassieClient,
): Promise<any> {
  const ctx = { message };

  if (!message.guild) return sendError(ctx, 'This command can only be used in a server.');

  const invokerPerms = message.channel.permissionsFor?.(message.member);
  if (!invokerPerms?.has?.(PermissionFlagsBits.ModerateMembers))
    return sendError(ctx, 'You need the **Timeout Members** permission to use this command.');

  const botMember = await message.guild.members.fetchMe().catch((): null => null);
  if (!botMember?.permissions?.has?.(PermissionFlagsBits.ModerateMembers))
    return sendError(ctx, 'I need the **Timeout Members** permission to timeout members.');

  if (!args[0] || !args[1])
    return sendError(ctx, `**Usage:**\n\`\`\`\n${options.usage}\n\`\`\``);

  const targetUser = await resolveUser(client, message.guild, args[0]);
  if (!targetUser) return sendError(ctx, `Could not find a user matching \`${args[0]}\`.`);

  const durationRaw = args[1].toLowerCase();
  const isRemove    = durationRaw === 'remove' || durationRaw === 'off';

  const result = await getMemberAndCheck({
    guild:         message.guild,
    targetUser,
    invokerId:     message.author.id,
    invokerMember: message.member,
    botMember,
    developers:    client.config.developers,
  });
  if ('error' in result) return sendError(ctx, result.error);

  const reason = args.slice(2).join(' ').trim() || 'No reason provided.';

  if (isRemove) {
    if (!result.member.communicationDisabledUntil)
      return sendError(ctx, `**${targetUser.username}** does not have an active timeout.`);

    let dmSent = false;
    try {
      const dm = await targetUser.createDM();
      await dm.send(buildTimeoutRemoveDmPayload(message.guild.name, reason, message.author.username));
      dmSent = true;
    } catch { /* DMs closed */ }

    const removed = await result.member.timeout(null, reason).catch((err: any): null => {
      console.error(`[timeout] failed to remove timeout from ${targetUser.id}: ${err?.message ?? err}`);
      return null;
    });
    if (!removed) return sendError(ctx, `Failed to remove timeout from **${targetUser.username}**.`);

    sendModLog(client, message.guild.id, buildModLogUnTimeout(targetUser, reason, message.author.username));
    const invoked = await sendInvokeResponse(
      { message },
      client,
      'mute',
      { targetUser, reason },
    );
    if (!invoked) {
      return message.channel.send(buildTimeoutRemovePayload(targetUser, reason, message.author.username, dmSent));
    }
    return;
  }

  const durationMs = parseDuration(durationRaw);
  if (!durationMs)
    return sendError(ctx, `Invalid duration \`${durationRaw}\`. Examples: \`10m\`, \`1h\`, \`1d\`, \`7d\`.`);
  if (durationMs > MAX_TIMEOUT_MS)
    return sendError(ctx, 'Maximum timeout duration is **28 days**.');

  let dmSent = false;
  try {
    const dm = await targetUser.createDM();
    await dm.send(buildTimeoutAddDmPayload(message.guild.name, durationMs, reason, message.author.username));
    dmSent = true;
  } catch { /* DMs closed */ }

  const timed = await result.member.timeout(durationMs, reason).catch((err: any): null => {
    console.error(`[timeout] failed to timeout ${targetUser.id}: ${err?.message ?? err}`);
    return null;
  });
  if (!timed) return sendError(ctx, `Failed to timeout **${targetUser.username}**.`);

  sendModLog(client, message.guild.id, buildModLogTimeout(targetUser, durationMs, reason, message.author.username, dmSent));
  const invoked = await sendInvokeResponse(
    { message },
    client,
    'mute',
    { targetUser, reason, duration: durationRaw },
  );
  if (!invoked) {
    await message.channel.send(buildTimeoutAddPayload(targetUser, durationMs, reason, message.author.username, dmSent));
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Slash
// ─────────────────────────────────────────────────────────────────────────────

export async function slashExecute(
  interaction: any,
  client:      CassieClient,
): Promise<any> {
  await interaction.deferReply();
  const ctx = { interaction };

  if (!interaction.guild) return sendError(ctx, 'This command can only be used in a server.');

  const invokerMember = interaction.member;
  if (!invokerMember?.permissions?.has?.(PermissionFlagsBits.ModerateMembers))
    return sendError(ctx, 'You need the **Timeout Members** permission to use this command.');

  const botMember = await interaction.guild.members.fetchMe().catch((): null => null);
  if (!botMember?.permissions?.has?.(PermissionFlagsBits.ModerateMembers))
    return sendError(ctx, 'I need the **Timeout Members** permission to timeout members.');

  const subcommand = interaction.options.getSubcommand(true) as 'add' | 'remove';
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

  if (subcommand === 'remove') {
    if (!result.member.communicationDisabledUntil)
      return sendError(ctx, `**${targetUser.username}** does not have an active timeout.`);

    return confirmSlashAction({
      interaction,
      title:       'Confirm Remove Timeout',
      description: `Are you sure you want to remove the timeout from **${targetUser.username}**?\n-# Reason: ${reason}`,
      onConfirm: async () => {
        let dmSent = false;
        try {
          const dm = await targetUser.createDM();
          await dm.send(buildTimeoutRemoveDmPayload(interaction.guild.name, reason, interaction.user.username));
          dmSent = true;
        } catch { /* DMs closed */ }

        const removed = await result.member.timeout(null, reason).catch((err: any): null => {
          console.error(`[timeout] failed to remove timeout from ${targetUser.id}: ${err?.message ?? err}`);
          return null;
        });
        if (!removed) {
          await sendError(ctx, `Failed to remove timeout from **${targetUser.username}**.`);
          return;
        }

         const invoked = await sendInvokeResponse(
           { interaction },
           client,
           'mute',
           { targetUser, reason },
         );
         if (!invoked) {
           await interaction.editReply(buildTimeoutRemovePayload(targetUser, reason, interaction.user.username, dmSent));
         }
        sendModLog(client, interaction.guild.id, buildModLogUnTimeout(targetUser, reason, interaction.user.username));
      },
    });
  }

  // subcommand === 'add'
  const durationRaw = interaction.options.getString('duration', true);
  const durationMs  = parseDuration(durationRaw);
  if (!durationMs)
    return sendError(ctx, `Invalid duration \`${durationRaw}\`. Examples: \`10m\`, \`1h\`, \`1d\`, \`7d\`.`);
  if (durationMs > MAX_TIMEOUT_MS)
    return sendError(ctx, 'Maximum timeout duration is **28 days**.');

  await confirmSlashAction({
    interaction,
    title:       'Confirm Timeout',
    description: `Are you sure you want to timeout **${targetUser.username}** for **${durationRaw}**?\n-# Reason: ${reason}`,
    onConfirm: async () => {
      let dmSent = false;
      try {
        const dm = await targetUser.createDM();
        await dm.send(buildTimeoutAddDmPayload(interaction.guild.name, durationMs, reason, interaction.user.username));
        dmSent = true;
      } catch { /* DMs closed */ }

      const timed = await result.member.timeout(durationMs, reason).catch((err: any): null => {
        console.error(`[timeout] failed to timeout ${targetUser.id}: ${err?.message ?? err}`);
        return null;
      });
      if (!timed) {
        await sendError(ctx, `Failed to timeout **${targetUser.username}**.`);
        return;
      }

       const invoked = await sendInvokeResponse(
         { interaction },
         client,
        'mute',
         { targetUser, reason, duration: durationRaw },
       );
       if (!invoked) {
         await interaction.editReply(buildTimeoutAddPayload(targetUser, durationMs, reason, interaction.user.username, dmSent));
       }
      sendModLog(client, interaction.guild.id, buildModLogTimeout(targetUser, durationMs, reason, interaction.user.username, dmSent));
    },
  });
}
