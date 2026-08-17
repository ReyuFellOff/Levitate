// xoxo/commands/customisation/resetprofile.ts
//
// Reset the bot's server profile (nickname, avatar, banner, bio) to global defaults.
// Requires Administrator permission.
//
// Usage:
//   resetprofile

import { REST, Routes, MessageFlags } from 'discord.js';
import type { LevitateClient } from '../../structures/LevitateClient.js';
import { sendSuccess, sendError, sendLoading } from '../../components/statusMessages.js';

export const options = {
  name: 'resetprofile',
  aliases: [] as string[],
  description: "Reset the bot's server profile (nickname, avatar, banner, bio) to global defaults.",
  usage: 'resetprofile',
  category: 'customisation',
  owner: false,
  cooldown: 10,
};

export async function slashExecute(interaction: any, client: LevitateClient): Promise<any> {
  if (!interaction.guild) {
    await interaction.reply({ content: 'This command can only be used in a server.', flags: MessageFlags.Ephemeral });
    return;
  }

  const memberPerms = interaction.member?.permissions;
  if (!memberPerms?.has?.('Administrator')) {
    return sendError({ interaction }, 'You need the **Administrator** permission to use this command.');
  }

  await interaction.deferReply();

  const token = client.config.botToken;
  if (!token) {
    return sendError({ interaction }, 'Bot token is not configured.');
  }

  try {
    const rest = new REST({ version: '10' }).setToken(token);
    await rest.patch(Routes.guildMember(interaction.guild.id, '@me'), {
      body: { nick: null, avatar: null, banner: null, bio: null },
    });
    return sendSuccess({ interaction }, 'Server profile reset to global defaults.');
  } catch (err: any) {
    console.error('[RESETPROFILE]', err.message);
    return sendError({ interaction }, `Failed to reset profile: ${err.message}`);
  }
}

export async function prefixExecute(message: any, _args: string[], client: LevitateClient): Promise<any> {
  if (!message.guild) return sendError({ message }, 'This command can only be used in a server.');

  const authorPerms = message.channel.permissionsFor?.(message.member);
  if (!authorPerms?.has?.('Administrator')) {
    return sendError({ message }, 'You need the **Administrator** permission to use this command.');
  }

  const statusCtx = { message };
  const successCtx = { channel: message.channel };

  const loadingMsg = await sendLoading(statusCtx, 'Resetting server profile to global defaults...');

  const token = client.config.botToken;
  if (!token) {
    await sendError(successCtx, 'Bot token is not configured.');
    return;
  }

  try {
    const rest = new REST({ version: '10' }).setToken(token);
    await rest.patch(Routes.guildMember(message.guild.id, '@me'), {
      body: { nick: null, avatar: null, banner: null, bio: null },
    });
    await sendSuccess(successCtx, 'Server profile reset to global defaults.');
    setTimeout(() => (loadingMsg as any)?.delete().catch((): null => null), 2000);
  } catch (err: any) {
    console.error('[RESETPROFILE]', err.message);
    return sendError(successCtx, `Failed to reset profile: ${err.message}`);
  }
}
