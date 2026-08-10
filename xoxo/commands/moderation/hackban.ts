// xoxo/commands/moderation/hackban.ts
//
// Ban a user who is not in the server (e.g. pre-emptive ban of a known
// raider's alt). Calls guild.bans.create() directly with the raw ID.
//
// Prefix:  $hackban <userId> [reason]
// Slash:   /hackban user_id:<string> [reason]

import { PermissionFlagsBits } from 'discord.js';
import type { LevitateClient } from '../../structures/LevitateClient.js';
import { sendError } from '../../components/statusMessages.js';
import { buildHackbanSuccessPayload } from '../../components/moderation/hackban.js';
import { buildModLogHackban } from '../../components/moderation/modlog.js';
import { sendModLog } from '../../utils/modlogHelper.js';
import { confirmSlashAction } from '../../components/moderation/actionConfirm.js';

export const options = {
  name:        'hackban',
  aliases:     ['forceban'] as string[],
  description: 'Ban a user by ID even if they are not in the server.',
  usage:       'hackban <userId> [reason]',
  category:    'moderation',
  owner:       false,
  cooldown:    3,
};

const SNOWFLAKE_RE = /^\d{17,20}$/;

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

  const userId = args[0].trim();
  if (!SNOWFLAKE_RE.test(userId)) return sendError(ctx, 'Provide a valid user ID (snowflake).');

  if (userId === message.author.id) return sendError(ctx, 'You cannot hackban yourself.');
  if (userId === message.guild.ownerId) return sendError(ctx, 'You cannot hackban the server owner.');
  if (client.config.developers.some(([, id]) => id === userId))
    return sendError(ctx, 'You cannot hackban a bot developer.');

  const existingMember = await message.guild.members.fetch(userId).catch((): null => null);
  if (existingMember) return sendError(ctx, 'That user is already in the server — use `ban` instead.');

  const reason = args.slice(1).join(' ').trim() || 'No reason provided.';

  const target = await client.users.fetch(userId).catch((): null => null);

  const banned = await message.guild.bans
    .create(userId, { reason, deleteMessageSeconds: 0 })
    .catch((): null => null);

  if (!banned)
    return sendError(ctx, `Failed to hackban \`${userId}\`. Check that the ID is valid and I have permission.`);

  await message.channel.send(
    buildHackbanSuccessPayload(userId, target?.username ?? null, reason, message.author.username),
  );
  sendModLog(client, message.guild.id, buildModLogHackban(userId, target?.username ?? null, reason, message.author.username));
}

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

  const userId = interaction.options.getString('user_id', true).trim();
  const reason = (interaction.options.getString('reason') ?? 'No reason provided.').trim();

  if (!SNOWFLAKE_RE.test(userId)) return sendError(ctx, 'Provide a valid user ID (snowflake).');
  if (userId === interaction.user.id) return sendError(ctx, 'You cannot hackban yourself.');
  if (userId === interaction.guild.ownerId) return sendError(ctx, 'You cannot hackban the server owner.');
  if (client.config.developers.some(([, id]) => id === userId))
    return sendError(ctx, 'You cannot hackban a bot developer.');

  const existingMember = await interaction.guild.members.fetch(userId).catch((): null => null);
  if (existingMember) return sendError(ctx, 'That user is already in the server — use `/ban` instead.');

  const target = await client.users.fetch(userId).catch((): null => null);

  await confirmSlashAction({
    interaction,
    title:       'Confirm Hackban',
    description: `Are you sure you want to hackban \`${userId}\`${target ? ` (${target.username})` : ''}?\n-# Reason: ${reason}`,
    onConfirm: async () => {
      const banned = await interaction.guild.bans
        .create(userId, { reason, deleteMessageSeconds: 0 })
        .catch((): null => null);

      if (!banned) {
        await sendError(ctx, `Failed to hackban \`${userId}\`. Check that the ID is valid and I have permission.`);
        return;
      }

      await interaction.editReply(
        buildHackbanSuccessPayload(userId, target?.username ?? null, reason, interaction.user.username),
      );
      sendModLog(client, interaction.guild.id, buildModLogHackban(userId, target?.username ?? null, reason, interaction.user.username));
    },
  });
}
