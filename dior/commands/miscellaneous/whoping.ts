// xoxo/commands/utility/whoping.ts
//
// Show messages that directly pinged a user in this channel.
// Only counts <@userId> mentions and reply-pings — not role mentions.
//
// Usage:
//   $whoping              — pings of yourself
//   $whoping @user        — pings of another user
//   $whoping <user ID>    — pings of a user by ID
//   $whoping <username>   — pings of a user by username/display name

import type { CassieClient }          from '../../structures/CassieClient.js';
import { sendError }                    from '../../components/statusMessages.js';
import { buildWhopingPayload }          from '../../components/utility/whoping.js';
import type { PingEntry }               from '../../components/utility/whoping.js';
import { resolveUser }                  from '../../helpers/userResolver.js';

export const options = {
  name:        'whoping',
  aliases:     ['wp', 'whoponged'] as string[],
  description: 'Show messages that pinged a user in this channel.',
  usage:       'whoping [@user | user ID | username]',
  category:    'miscellaneous',
  owner:       false,
  cooldown:    5,
};

const FETCH_LIMIT  = 1000;
async function resolveTarget(
  args:    string[],
  message: any,
  client:  CassieClient,
): Promise<{ userId: string; tag: string } | null> {
  if (!args[0]) {
    return { userId: message.author.id, tag: message.author.username };
  }

  const user = await resolveUser(client, message.guild, args[0]);
  return user ? { userId: user.id, tag: user.username } : null;
}

async function collectPings(
  channel:      any,
  targetUserId: string,
): Promise<{ pings: PingEntry[]; scanned: number }> {
  const fetched: any[] = [];

  try {
    let before: string | undefined;

    while (fetched.length < FETCH_LIMIT) {
      const batch = await channel.messages.fetch({
        limit: Math.min(100, FETCH_LIMIT - fetched.length),
        ...(before ? { before } : {}),
      });
      if (!batch.size) break;
      const arr = [...batch.values()] as any[];
      fetched.push(...arr);
      before = arr[arr.length - 1]?.id;
    }
  } catch {
    return { pings: [], scanned: 0 };
  }

  const pings: PingEntry[] = [];

  for (const msg of fetched) {
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
  client:  CassieClient,
): Promise<any> {
  if (!message.guild) {
    return sendError({ message }, 'This command can only be used in a server.');
  }

  const target = await resolveTarget(args, message, client);
  if (!target) {
    return sendError({ message }, 'Could not find that user. Provide a valid mention, user ID, or username.');
  }

  const { pings, scanned } = await collectPings(message.channel, target.userId);
  let page = 0;
  const response = await message.channel.send(buildWhopingPayload(target.userId, pings, scanned, page));

  if (pings.length <= 10) return response;

  const collector = response.createMessageComponentCollector({
    filter: (interaction: any) =>
      interaction.user.id === message.author.id &&
      ['whoping:previous', 'whoping:next'].includes(interaction.customId),
    time: 5 * 60 * 1000,
  });

  collector.on('collect', async (interaction: any) => {
    const pageCount = Math.ceil(pings.length / 10);
    page = interaction.customId === 'whoping:next'
      ? Math.min(page + 1, pageCount - 1)
      : Math.max(page - 1, 0);
    await interaction.update(buildWhopingPayload(target.userId, pings, scanned, page));
  });

  return response;
}
