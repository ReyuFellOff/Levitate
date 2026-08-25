// xoxo/commands/moderation/strip.ts
//
// Remove all non-managed, non-@everyone roles from a member.
//
// Prefix:  $strip <@user|ID|username> [reason]
// Slash:   /strip user:<user> [reason]  (with confirmation)

import { PermissionFlagsBits } from 'discord.js';
import type { CassieClient } from '../../structures/CassieClient.js';
import { sendError } from '../../components/statusMessages.js';
import { buildStripSuccessPayload } from '../../components/moderation/strip.js';
import { buildModLogStrip } from '../../components/moderation/modlog.js';
import { sendModLog } from '../../utils/modlogHelper.js';
import { resolveUser } from '../../helpers/userResolver.js';
import { confirmSlashAction } from '../../components/moderation/actionConfirm.js';
import { sendInvokeResponse } from '../../helpers/invoke.js';

export const options = {
  name:        'strip',
  aliases:     [] as string[],
  description: "Remove all of a member's roles.",
  usage:       'strip <@user|ID|username> [reason]',
  category:    'moderation',
  owner:       false,
  cooldown:    3,
};

function checkTarget(guild: any, targetUser: any, invokerId: string, developers: [string, string][]): string | null {
  if (targetUser.id === invokerId)     return 'You cannot strip your own roles.';
  if (targetUser.id === guild.ownerId) return 'You cannot strip the server owner.';
  if (developers.some(([, id]) => id === targetUser.id))
    return 'You cannot strip a bot developer.';
  return null;
}

async function doStrip(
  guild:      any,
  member:     any,
  botMember:  any,
): Promise<{ removed: number; skipped: number }> {
  const botTop = botMember?.roles?.highest?.position ?? 0;
  const toRemove = member.roles.cache.filter(
    (role: any) => role.id !== guild.roles.everyone.id && !role.managed && role.position < botTop,
  );
  const skipped = member.roles.cache.filter(
    (role: any) => role.id !== guild.roles.everyone.id && (role.managed || role.position >= botTop),
  ).size;

  if (toRemove.size === 0) return { removed: 0, skipped };

  const ok = await member.roles
    .remove([...toRemove.keys()], 'Roles stripped.')
    .then(() => true)
    .catch(() => false);

  return { removed: ok ? toRemove.size : 0, skipped };
}

export async function prefixExecute(
  message: any,
  args:    string[],
  client:  CassieClient,
): Promise<any> {
  const ctx = { message };

  if (!message.guild) return sendError(ctx, 'This command can only be used in a server.');

  const invokerPerms = message.channel.permissionsFor?.(message.member);
  if (!invokerPerms?.has?.(PermissionFlagsBits.ManageRoles))
    return sendError(ctx, 'You need the **Manage Roles** permission to use this command.');

  const botMember = await message.guild.members.fetchMe().catch((): null => null);
  if (!botMember?.permissions?.has?.(PermissionFlagsBits.ManageRoles))
    return sendError(ctx, 'I need the **Manage Roles** permission to do this.');

  if (!args[0])
    return sendError(ctx, `**Usage:** \`${client.config.prefix}${options.usage}\``);

  const targetUser = await resolveUser(client, message.guild, args[0]);
  if (!targetUser) return sendError(ctx, `Could not find a user matching \`${args[0]}\`.`);

  const err = checkTarget(message.guild, targetUser, message.author.id, client.config.developers);
  if (err) return sendError(ctx, err);

  const targetMember = await message.guild.members.fetch(targetUser.id).catch((): null => null);
  if (!targetMember) return sendError(ctx, `**${targetUser.username}** is not a member of this server.`);

  const { removed, skipped } = await doStrip(message.guild, targetMember, botMember);
  if (removed === 0 && skipped === 0)
    return sendError(ctx, `**${targetUser.username}** has no roles to remove.`);

  const invoked = await sendInvokeResponse(
    { message },
    client,
    'strip',
    { targetUser },
  );
  if (!invoked) {
    await message.channel.send(buildStripSuccessPayload(targetUser, removed, skipped, message.author.username));
  }
  sendModLog(client, message.guild.id, buildModLogStrip(targetUser, removed, skipped, message.author.username));
}

export async function slashExecute(
  interaction: any,
  client:      CassieClient,
): Promise<any> {
  await interaction.deferReply();
  const ctx = { interaction };

  if (!interaction.guild) return sendError(ctx, 'This command can only be used in a server.');

  const invokerMember = interaction.member;
  if (!invokerMember?.permissions?.has?.(PermissionFlagsBits.ManageRoles))
    return sendError(ctx, 'You need the **Manage Roles** permission to use this command.');

  const botMember = await interaction.guild.members.fetchMe().catch((): null => null);
  if (!botMember?.permissions?.has?.(PermissionFlagsBits.ManageRoles))
    return sendError(ctx, 'I need the **Manage Roles** permission to do this.');

  const targetUser = interaction.options.getUser('user', true);

  const err = checkTarget(interaction.guild, targetUser, interaction.user.id, client.config.developers);
  if (err) return sendError(ctx, err);

  const targetMember = await interaction.guild.members.fetch(targetUser.id).catch((): null => null);
  if (!targetMember) return sendError(ctx, `**${targetUser.username}** is not a member of this server.`);

  await confirmSlashAction({
    interaction,
    title:       'Confirm Strip',
    description: `Are you sure you want to remove all roles from **${targetUser.username}**?`,
    onConfirm: async () => {
      const { removed, skipped } = await doStrip(interaction.guild, targetMember, botMember);
      if (removed === 0 && skipped === 0) {
        await sendError(ctx, `**${targetUser.username}** has no roles to remove.`);
        return;
      }
       const invoked = await sendInvokeResponse(
         { interaction },
         client,
         'strip',
         { targetUser },
       );
       if (!invoked) {
         await interaction.editReply(buildStripSuccessPayload(targetUser, removed, skipped, interaction.user.username));
       }
      sendModLog(client, interaction.guild.id, buildModLogStrip(targetUser, removed, skipped, interaction.user.username));
    },
  });
}
