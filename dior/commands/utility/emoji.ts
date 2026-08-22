import { PermissionFlagsBits } from 'discord.js';
import type { LevitateClient } from '../../structures/LevitateClient.js';
import { sendError, sendSuccess } from '../../components/statusMessages.js';
import { sendWrongUsage } from '../../components/wrongUsage.js';
import { resolveEmoji } from '../../helpers/emojiResolver.js';

export const options = {
  name: 'emoji',
  aliases: [] as string[],
  description: 'Delete or rename custom emojis in this server.',
  usage: `emoji delete <emoji> <emoji> ...
  emoji rename <emoji> <name>`,
  category: 'utility',
  owner: false,
  userPerms: ['ManageGuildExpressions'] as string[],
  cooldown: 3,
};

function canManageExpressions(member: any): boolean {
  const permissions = member?.permissions;
  return Boolean(
    permissions?.has?.(PermissionFlagsBits.Administrator)
      || permissions?.has?.(PermissionFlagsBits.ManageGuildExpressions)
      || permissions?.has?.(PermissionFlagsBits.ManageEmojisAndStickers),
  );
}

async function resolveGuildEmoji(
  message: any,
  identifier: string,
  client: LevitateClient,
): Promise<any | null> {
  const emoji = await resolveEmoji(client, identifier, message.guild);
  if (!emoji || typeof emoji !== 'object' || !emoji.id) return null;
  return emoji.guild?.id === message.guild.id ? emoji : null;
}

export async function prefixExecute(message: any, args: string[], client: LevitateClient) {
  if (!message.guild) return sendError({ message }, 'This command can only be used in a server.');

  if (!canManageExpressions(message.member)) {
    return sendError(
      { message },
      'You need **Manage Expressions** or **Administrator** permission to use this command.',
    );
  }

  const botMember = message.guild.members.me
    ?? await message.guild.members.fetchMe().catch((): null => null);
  if (!canManageExpressions(botMember)) {
    return sendError(
      { message },
      'I need **Manage Expressions** permission to manage this server\'s emojis.',
    );
  }

  const action = args[0]?.toLowerCase();
  if (action === 'delete') {
    if (args.length < 2) return sendWrongUsage({ message, client }, options.name, options.usage);

    const deleted: string[] = [];
    const invalid: string[] = [];
    for (const identifier of args.slice(1)) {
      const emoji = await resolveGuildEmoji(message, identifier, client);
      if (!emoji) {
        invalid.push(identifier);
        continue;
      }

      try {
        await emoji.delete(`Deleted by ${message.author.tag} via emoji command.`);
        deleted.push(identifier);
      } catch {
        invalid.push(identifier);
      }
    }

    if (!deleted.length) return sendError({ message }, 'None of the provided emojis could be deleted.');
    const result = await sendSuccess({ message }, `Deleted ${deleted.length} emoji${deleted.length === 1 ? '' : 's'}.`);
    if (invalid.length) {
      await message.channel.send(`Could not delete: ${invalid.map((id) => `\`${id}\``).join(', ')}`);
    }
    return result;
  }

  if (action === 'rename') {
    if (args.length !== 3 || !args[2]) return sendWrongUsage({ message, client }, options.name, options.usage);

    const emoji = await resolveGuildEmoji(message, args[1], client);
    if (!emoji) return sendError({ message }, 'That emoji was not found in this server.');

    try {
      await emoji.edit({ name: args[2] }, `Renamed by ${message.author.tag} via emoji command.`);
      return sendSuccess({ message }, `Renamed the emoji to **${args[2]}**.`);
    } catch {
      return sendError({ message }, 'I could not rename that emoji. Check the name and my permissions.');
    }
  }

  return sendWrongUsage({ message, client }, options.name, options.usage);
}