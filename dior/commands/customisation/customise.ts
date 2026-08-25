// xoxo/commands/customisation/customise.ts
//
// $customise / $customize — Interactive bot profile customisation panel.
//
// Opens a CV2 panel with:
//   • Profile button  — modal to edit name, bio, avatar URL, banner URL
//   • Namestyle button — opens the interactive namestyle wizard inline
//   • Reset profile   — confirms then resets server profile to global defaults
//   • Done            — dismisses the panel
//
// Requires: Administrator permission (invoker)

import { PermissionFlagsBits } from 'discord.js';
import type { CassieClient }   from '../../structures/CassieClient.js';
import { sendError }             from '../../components/statusMessages.js';
import {
  buildHomePage,
  registerCustomiseSession,
  resolveBotDisplayName,
  resolveBotAvatarUrl,
} from '../../components/customisation/customise.js';

export const options = {
  name:        'customise',
  aliases:     ['customize'] as string[],
  description: "Interactive panel to customise the bot's server profile, namestyle, and more.",
  usage:       'customise',
  category:    'customisation',
  owner:       false,
  cooldown:    5,
};

export async function prefixExecute(
  message: any,
  _args:   string[],
  client:  CassieClient,
): Promise<any> {
  const ctx = { message };

  if (!message.guild)
    return sendError(ctx, 'This command can only be used in a server.');

  const invokerPerms = message.channel.permissionsFor?.(message.member);
  if (!invokerPerms?.has?.(PermissionFlagsBits.Administrator)) {
    return sendError(ctx, 'You need the **Administrator** permission to customise the bot.');
  }

  const scopeId        = message.id;
  const guildName      = message.guild.name as string;
  const botDisplayName = await resolveBotDisplayName(client, message.guild.id);
  const avatarUrl      = await resolveBotAvatarUrl(client, message.guild.id);

  const botMsg = await message.channel
    .send(buildHomePage(scopeId, guildName, botDisplayName, avatarUrl))
    .catch((): null => null);
  if (!botMsg) return;

  registerCustomiseSession(scopeId, {
    guildId:   message.guild.id,
    guildName,
    authorId:  message.author.id,
    channelId: message.channel.id,
    botMsgId:  botMsg.id,
    client,
    step:      'home',
  });
}

export async function slashExecute(
  interaction: any,
  client:      CassieClient,
): Promise<any> {
  const ctx = { interaction };

  if (!interaction.guild)
    return sendError(ctx, 'This command can only be used in a server.');

  const memberPerms = interaction.member?.permissions;
  if (!memberPerms?.has?.(PermissionFlagsBits.Administrator)) {
    return sendError(ctx, 'You need the **Administrator** permission to customise the bot.');
  }

  await interaction.deferReply();

  const scopeId        = interaction.id;
  const guildName      = interaction.guild.name as string;
  const botDisplayName = await resolveBotDisplayName(client, interaction.guildId);
  const avatarUrl      = await resolveBotAvatarUrl(client, interaction.guildId);

  const msg = await interaction.editReply(
    buildHomePage(scopeId, guildName, botDisplayName, avatarUrl),
  );

  registerCustomiseSession(scopeId, {
    guildId:   interaction.guildId,
    guildName,
    authorId:  interaction.user.id,
    channelId: interaction.channelId,
    botMsgId:  msg.id,
    client,
    step:      'home',
  });
}
