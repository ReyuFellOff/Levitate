// xoxo/commands/customisation/setbio.ts
//
// Set the bot's bio in this server. Requires Administrator permission.
//
// Usage:
//   setbio <text>

import { REST, Routes, MessageFlags } from 'discord.js';
import type { CassieClient } from '../../structures/CassieClient.js';
import { sendSuccess, sendError, sendLoading } from '../../components/statusMessages.js';
import { sendWrongUsage } from '../../components/wrongUsage.js';
import { parseSayText } from '../../helpers/emojiParser.js';
import { resolveEmoji } from '../../helpers/emojiResolver.js';

export const options = {
  name: 'setbio',
  aliases: [] as string[],
  description: "Set the bot's bio in this server.",
  usage: 'setbio <text>',
  category: 'customisation',
  owner: false,
  cooldown: 10,
};

async function handle(
  message: any,
  text: string,
  client: CassieClient,
): Promise<any> {
  const statusCtx = { message };
  const successCtx = { channel: message.channel };

  const authorPerms = message.channel.permissionsFor?.(message.member);
  if (!authorPerms?.has?.('Administrator')) {
    return sendError(statusCtx, 'You need the **Administrator** permission to use this command.');
  }

  const { text: parsedText, invalid } = await parseSayText(
    text,
    (id) => resolveEmoji(client, id, message.guild),
  );
  if (invalid.length) {
    return sendError(statusCtx, `Could not resolve emoji: ${invalid.map((i) => `\`${i}\``).join(', ')}`);
  }

  const loadingMsg = await sendLoading(statusCtx, 'Setting server bio...');

  const token = client.config.botToken;
  if (!token) {
    await sendError(successCtx, 'Bot token is not configured.');
    return;
  }

  try {
    const rest = new REST({ version: '10' }).setToken(token);
    await rest.patch(Routes.guildMember(message.guild.id, '@me'), { body: { bio: parsedText } });
    await sendSuccess(successCtx, 'Server bio updated successfully.');
    setTimeout(() => (loadingMsg as any)?.delete().catch((): null => null), 2000);
  } catch (err: any) {
    console.error('[SETBIO]', err.message);
    if (err.message?.includes('50035')) {
      return sendError(successCtx, 'Invalid bio format. Please check for unsupported characters.');
    }
    return sendError(successCtx, `Failed to set bio: ${err.message}`);
  }
}

export async function slashExecute(interaction: any, client: CassieClient): Promise<any> {
  if (!interaction.guild) {
    await interaction.reply({ content: 'This command can only be used in a server.', flags: MessageFlags.Ephemeral });
    return;
  }

  const memberPerms = interaction.member?.permissions;
  if (!memberPerms?.has?.('Administrator')) {
    return sendError({ interaction }, 'You need the **Administrator** permission to use this command.');
  }

  const text: string = interaction.options.getString('text', true);
  await interaction.deferReply();

  const { text: parsedText, invalid } = await parseSayText(
    text,
    (id) => resolveEmoji(client, id, interaction.guild),
  );
  if (invalid.length) {
    return sendError({ interaction }, `Could not resolve emoji: ${invalid.map((i) => `\`${i}\``).join(', ')}`);
  }

  const token = client.config.botToken;
  if (!token) {
    return sendError({ interaction }, 'Bot token is not configured.');
  }

  try {
    const rest = new REST({ version: '10' }).setToken(token);
    await rest.patch(Routes.guildMember(interaction.guild.id, '@me'), { body: { bio: parsedText } });
    return sendSuccess({ interaction }, 'Server bio updated successfully.');
  } catch (err: any) {
    console.error('[SETBIO]', err.message);
    if (err.message?.includes('50035')) {
      return sendError({ interaction }, 'Invalid bio format. Please check for unsupported characters.');
    }
    return sendError({ interaction }, `Failed to set bio: ${err.message}`);
  }
}

export async function prefixExecute(message: any, args: string[], client: CassieClient): Promise<any> {
  if (!message.guild) return sendError({ message }, 'This command can only be used in a server.');
  if (!args.length) return sendWrongUsage({ message, client }, options.name, options.usage);
  return handle(message, args.join(' '), client);
}
