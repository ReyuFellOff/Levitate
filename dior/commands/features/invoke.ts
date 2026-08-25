// Personal, global replacement messages for supported moderation commands.
//
// Prefix:
//   $invoke set <command> <message>
//   $invoke remove <command>
//   $invoke list
//
// Supported placeholders:
//   {user} {mention} {id} {reason} {invoker} {invokerMention}
//   {duration} {count} {command}

import type { CassieClient } from '../../structures/CassieClient.js';
import { sendError, sendInfo, sendSuccess } from '../../components/statusMessages.js';
import { INVOKE_COMMANDS, type InvokeCommand } from '../../helpers/invoke.js';
import {
  buildInvokeListPayload,
  buildInvokeSavedPayload,
  MAX_INVOKE_MESSAGES,
} from '../../components/features/invoke.js';

export const options = {
  name:        'invoke',
  aliases:     [] as string[],
  description: 'Set personal responses for supported moderation commands.',
  usage:       'invoke set <command> <message>\n' +
               'invoke remove <command>\n' +
               'invoke list',
  category:    'features',
  owner:       false,
  cooldown:    3,
};

function isInvokeCommand(value: string | undefined): value is InvokeCommand {
  return Boolean(value && (INVOKE_COMMANDS as readonly string[]).includes(value));
}

function supportedText(): string {
  return INVOKE_COMMANDS.map((command) => `• \`${command}\``).join('\n');
}

export async function prefixExecute(
  message: any,
  args: string[],
  client: CassieClient,
): Promise<any> {
  const ctx = { message };
  if (!client.db) return sendError(ctx, 'Database is unavailable right now.');

  const action = args[0]?.toLowerCase();
  if (!action || action === 'list') {
    if (args.length > 1) return sendError(ctx, 'Usage: `invoke`, `invoke set <command> <message>`, or `invoke remove <command>`.');
    const docs = await client.db.getUserInvokes(message.author.id);
    if (!docs.length) {
      return message.channel.send(buildInvokeListPayload([], message.author.username));
    }
    return message.channel.send(buildInvokeListPayload(docs, message.author.username));
  }

  if (action === 'set') {
    const command = args[1]?.toLowerCase();
    const invokeMessage = args.slice(2).join(' ').trim();
    if (!isInvokeCommand(command) || !invokeMessage) {
      return sendError(
        ctx,
        `Usage: \`invoke set <command> <message>\`.\n\nSupported commands:\n${supportedText()}`,
      );
    }
    if (invokeMessage.length > MAX_INVOKE_MESSAGES) {
      return sendError(ctx, `The invoke message must be **${MAX_INVOKE_MESSAGES}** characters or fewer.`);
    }

    await client.db.setUserInvoke(message.author.id, command, invokeMessage);
    if (!client.userInvokes.has(message.author.id)) client.userInvokes.set(message.author.id, new Map());
    client.userInvokes.get(message.author.id)!.set(command, invokeMessage);
    return message.channel.send(buildInvokeSavedPayload(command, invokeMessage));
  }

  if (action === 'remove' || action === 'delete') {
    const command = args[1]?.toLowerCase();
    if (!isInvokeCommand(command) || args.length > 2) {
      return sendError(
        ctx,
        `Usage: \`invoke remove <command>\`.\n\nSupported commands:\n${supportedText()}`,
      );
    }
    const deleted = await client.db.deleteUserInvoke(message.author.id, command);
    client.userInvokes.get(message.author.id)?.delete(command);
    return deleted
      ? sendSuccess(ctx, `Removed invoke message for \`${command}\`.`)
      : sendInfo(ctx, `You do not have an invoke message set for \`${command}\`.`);
  }

  return sendError(
    ctx,
    `Unknown invoke action. Use \`invoke set\`, \`invoke remove\`, or \`invoke list\`.\n\nSupported commands:\n${supportedText()}`,
  );
}
