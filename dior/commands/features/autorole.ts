// xoxo/commands/utility/autorole.ts
//
// $autorole — configure roles automatically given to new members on join.
// Members and bots are configured separately, each supporting multiple roles.
//
// Usage:
//   $autorole   — opens the interactive panel
//
// All configuration is done through the interactive panel: role select menus
// handle member/bot role selection, and buttons handle enable/disable/clear.

import { PermissionFlagsBits } from 'discord.js';
import type { LevitateClient } from '../../structures/LevitateClient.js';
import { sendError }           from '../../components/statusMessages.js';
import { buildPanel, registerArSession } from '../../components/utility/autorole.js';

export const options = {
  name:        'autorole',
  aliases:     ['ar', 'autoroles'] as string[],
  description: 'Configure roles automatically given to new members and bots when they join.',
  usage:       'autorole',
  category:    'features',
  owner:       false,
  cooldown:    3,
};

export async function prefixExecute(
  message: any,
  _args:   string[],
  client:  LevitateClient,
): Promise<any> {
  const ctx = { message };
  if (!message.guild) return sendError(ctx, 'This command can only be used in a server.');

  if (!message.member?.permissions?.has?.(PermissionFlagsBits.ManageRoles))
    return sendError(ctx, 'You need the **Manage Roles** permission to use this command.');

  if (!guildHasManageRoles(message.guild))
    return sendError(ctx, 'I need the **Manage Roles** permission.');

  if (!client.db) return sendError(ctx, 'Database is unavailable.');

  const guild   = message.guild;
  const scopeId = message.id; // stable scope for all customIds; set before the panel is sent

  const settings = await client.db.getAutoroleConfig(guild.id).catch((): null => null);
  const msg      = await message.channel.send(buildPanel(settings, scopeId, false));

  registerArSession(scopeId, {
    guildId:   guild.id,
    channelId: message.channel.id,
    botMsgId:  msg.id,
    client,
  });
}

function guildHasManageRoles(guild: any): boolean {
  return !!guild.members.me?.permissions?.has?.(PermissionFlagsBits.ManageRoles);
}

export async function slashExecute(interaction: any, client: LevitateClient): Promise<any> {
  await interaction.deferReply();

  if (!interaction.guild)
    return sendError({ interaction }, 'This command can only be used in a server.');

  if (!interaction.memberPermissions?.has?.(PermissionFlagsBits.ManageRoles))
    return sendError({ interaction }, 'You need the **Manage Roles** permission to use this command.');

  if (!guildHasManageRoles(interaction.guild))
    return sendError({ interaction }, 'I need the **Manage Roles** permission.');

  if (!client.db)
    return sendError({ interaction }, 'Database is unavailable.');

  const guild   = interaction.guild;
  const scopeId = interaction.id;

  const settings = await client.db.getAutoroleConfig(guild.id).catch((): null => null);
  const msg      = await interaction.editReply(buildPanel(settings, scopeId, false));

  registerArSession(scopeId, {
    guildId:   guild.id,
    channelId: interaction.channelId,
    botMsgId:  msg.id,
    client,
  });
}
