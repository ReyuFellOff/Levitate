// xoxo/commands/utility/whoping.ts
//
// Show the last 10 messages that directly pinged a user in this channel.
// Only counts <@userId> mentions and reply-pings — not role mentions.
//
// Usage:
//   $whoping              — pings of yourself
//   $whoping @user        — pings of another user
//   $whoping <user ID>    — pings of a user by ID

import type { LevitateClient }          from '../../structures/LevitateClient.js';
import { sendError }                    from '../../components/statusMessages.js';
import { buildWhopingPayload }          from '../../components/utility/whoping.js';
import type { PingEntry }               from '../../components/utility/whoping.js';

export const options = {
  name:        'whoping',
  aliases:     ['wp', 'whoponged'] as string[],
  description: 'Show the last 10 messages that pinged a user in this channel.',
  usage:       'whoping [@user | user ID]',
  category:    'miscellaneous',
  owner:       false,
  cooldown:    5,
};

const FETCH_LIMIT  = 200;
const RESULT_LIMIT = 10;

async function resolveTarget(
  args:    string[],
  message: any,
  client:  LevitateClient,
): Promise<{ userId: string; tag: string } | null> {
  if (!args[0]) {
    return { userId: message.author.id, tag: message.author.username };
  }

  const mention = args[0].match(/^<@!?(\d{17,20})>$/)?.[1];
  const rawId   = /^\d{17,20}$/.test(args[0]) ? args[0] : null;
  const id      = mention ?? rawId;

  if (!id) return null;

  try {
    const user = await client.users.fetch(id);
    return { userId: user.id, tag: user.username };
  } catch {
    return null;
  }
}

async function collectPings(
  channel:      any,
  targetUserId: string,
): Promise<{ pings: PingEntry[]; scanned: number }> {
  const fetched: any[] = [];

  try {
    let before: string | undefined;

    for (let i = 0; i < 2; i++) {
      const batch = await channel.messages.fetch({
        limit: 100,
        ...(before ? { before } : {}),
      });
      if (!batch.size) break;
      const arr = [...batch.values()] as any[];
      fetched.push(...arr);
      before = arr[arr.length - 1]?.id;
      if (fetched.length >= FETCH_LIMIT) break;
    }
  } catch {
    return { pings: [], scanned: 0 };
  }

  const pings: PingEntry[] = [];

  for (const msg of fetched) {
    if (pings.length >= RESULT_LIMIT) break;
    if (msg.author?.id === targetUserId) continue;

    const directlyMentioned: boolean =
      msg.mentions?.users?.has?.(targetUserId) ?? false;

    if (directlyMentioned) {
      pings.push({
        authorId:   msg.author.id,
        messageUrl: msg.url,
        timestamp:  msg.createdTimestamp,
      });
    }
  }

  return { pings, scanned: fetched.length };
}

export async function prefixExecute(
  message: any,
  args:    string[],
  client:  LevitateClient,
): Promise<any> {
  if (!message.guild) {
    return sendError({ message }, 'This command can only be used in a server.');
  }

  const target = await resolveTarget(args, message, client);
  if (!target) {
    return sendError({ message }, 'Could not find that user. Provide a valid @mention or user ID.');
  }

  const { pings, scanned } = await collectPings(message.channel, target.userId);

  return message.channel.send(buildWhopingPayload(target.userId, pings, scanned));
}
