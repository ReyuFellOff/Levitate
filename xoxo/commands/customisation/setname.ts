// xoxo/commands/customisation/setname.ts
//
// Change the bot's nickname in this server. Requires Administrator permission.
//
// Usage:
//   setname <nickname>
//   setname reset

import { REST, Routes, MessageFlags } from 'discord.js';
import type { LevitateClient } from '../../structures/LevitateClient.js';
import { sendSuccess, sendError, sendLoading } from '../../components/statusMessages.js';

export const options = {
  name: 'setname',
  aliases: [] as string[],
  description: "Change the bot's nickname in this server.",
  usage: `setname <nickname>
  setname reset`,
  category: 'customisation',
  owner: false,
  cooldown: 5,
};

async function setNickname(guildId: string, nick: string | null, token: string): Promise<any> {
  const rest = new REST({ version: '10' }).setToken(token);
  await rest.patch(Routes.guildMember(guildId, '@me'), { body: { nick } });
}

async function handle(
  message: any,
  nick: string | null,
  client: LevitateClient,
): Promise<any> {
  const statusCtx = { message };
  const successCtx = { channel: message.channel };

  const authorPerms = message.channel.permissionsFor?.(message.member);
  if (!authorPerms?.has?.('Administrator')) {
    return sendError(statusCtx, 'You need the **Administrator** permission to use this command.');
  }

  if (nick !== null && nick.length > 32) {
    return sendError(statusCtx, 'Nickname must be **32 characters** or less.');
  }

  const loadingMsg = await sendLoading(statusCtx, nick ? 'Changing nickname...' : 'Resetting nickname...');

  const token = client.config.botToken;
  if (!token) {
    await sendError(successCtx, 'Bot token is not configured.');
    return;
  }

  try {
    await setNickname(message.guild.id, nick, token);
    await sendSuccess(
      successCtx,
      nick ? `Nickname changed to **${nick}**.` : 'Nickname reset to global username.',
    );
    setTimeout(() => (loadingMsg as any)?.delete().catch((): null => null), 2000);
  } catch (err: any) {
    console.error('[SETNAME]', err.message);
    if (err.status === 403) return sendError(successCtx, 'Missing permissions to change the nickname.');
    return sendError(successCtx, `Failed to change nickname: ${err.message}`);
  }
}

export async function slashExecute(interaction: any, client: LevitateClient): Promise<any> {
  if (!interaction.guild) {
    await interaction.reply({ content: 'This command can only be used in a server.', flags: MessageFlags.Ephemeral });
    return;
  }

  const memberPerms = interaction.member?.permissions;
  if (!memberPerms?.has?.('Administrator')) {
    return sendError({ interaction }, 'You need the **Administrator** permission to use this command.');
  }

  const input: string | null = interaction.options.getString('nickname') ?? null;
  const nick = input === null ? null : input.trim() || null;

  if (nick !== null && nick.length > 32) {
    return sendError({ interaction }, 'Nickname must be **32 characters** or less.');
  }

  await interaction.deferReply();

  const token = client.config.botToken;
  if (!token) {
    return sendError({ interaction }, 'Bot token is not configured.');
  }

  try {
    await setNickname(interaction.guild.id, nick, token);
    return sendSuccess(
      { interaction },
      nick ? `Nickname changed to **${nick}**.` : 'Nickname reset to global username.',
    );
  } catch (err: any) {
    console.error('[SETNAME]', err.message);
    if (err.status === 403) return sendError({ interaction }, 'Missing permissions to change the nickname.');
    return sendError({ interaction }, `Failed to change nickname: ${err.message}`);
  }
}

export async function prefixExecute(message: any, args: string[], client: LevitateClient): Promise<any> {
  if (!message.guild) return sendError({ message }, 'This command can only be used in a server.');
  const input = args.join(' ').trim();
  const nick = input.toLowerCase() === 'reset' ? null : input || null;
  return handle(message, nick, client);
}
