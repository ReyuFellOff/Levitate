import type { CassieClient } from '../structures/CassieClient.js';

export const INVOKE_COMMANDS = [
  'ban',
  'hackban',
  'softban',
  'kick',
  'mute',
  'imagemute',
  'imageunmute',
  'nick',
  'unban',
  'unmute',
  'unjail',
  'strip',
  'warn',
  'jail',
] as const;

export type InvokeCommand = typeof INVOKE_COMMANDS[number];

export type InvokeContext = { message?: any; interaction?: any };

export type InvokeValues = {
  targetUser?: any;
  reason?: string;
  duration?: string;
  count?: number | string;
};

function getAuthor(context: InvokeContext): any {
  return context.message?.author ?? context.interaction?.user;
}

function renderInvokeMessage(
  template: string,
  command: InvokeCommand,
  values: InvokeValues,
  author: any,
): string {
  const target = values.targetUser;
  const targetId = target?.id ?? '';
  const targetName = target?.username ?? target?.globalName ?? targetId;
  const replacements: Record<string, string> = {
    user:            targetName,
    mention:         targetId ? `<@${targetId}>` : targetName,
    id:              targetId,
    reason:          values.reason ?? 'No reason provided.',
    invoker:         author?.username ?? author?.id ?? 'Unknown user',
    invokerMention:  author?.id ? `<@${author.id}>` : author?.username ?? 'Unknown user',
    duration:        values.duration ?? '',
    count:            String(values.count ?? ''),
    command,
  };

  return template.replace(/\{([a-zA-Z]+)\}/g, (match, key: string) =>
    Object.prototype.hasOwnProperty.call(replacements, key.toLowerCase())
      ? replacements[key.toLowerCase()]
      : match,
  );
}

/**
 * Send the invoking user's configured plain-text response.
 *
 * Returns true when an invoke message was configured and sent, so callers can
 * skip their normal Components V2 success response. Mentions are opt-in:
 * custom text cannot ping arbitrary roles/everyone, while {mention} and
 * {invokerMention} still work as intended.
 */
export async function sendInvokeResponse(
  context: InvokeContext,
  client: CassieClient,
  command: InvokeCommand,
  values: InvokeValues = {},
): Promise<boolean> {
  const author = getAuthor(context);
  const template = client.userInvokes.get(author?.id)?.get(command);
  if (!template) return false;

  const content = renderInvokeMessage(template, command, values, author);
  const targetId = values.targetUser?.id;
  const userIds = [targetId, author?.id].filter((id): id is string => Boolean(id));
  const payload = {
    content,
    allowedMentions: { parse: [] as string[], users: userIds },
  };

  if (context.interaction) {
    await context.interaction.editReply(payload);
  } else if (context.message) {
    await context.message.channel.send(payload);
  }
  return true;
}
