// xoxo/commands/fun/whowouldwin.ts
//
// $whowouldwin — pits two users against each other, deterministic "winner".
//
// Usage:
//   $whowouldwin                         — author vs random member
//   $whowouldwin random                  — author vs random member
//   $whowouldwin <@user>                 — author vs user
//   $whowouldwin <@user> random          — user vs random member
//   $whowouldwin <@user1> <@user2>       — user1 vs user2

import type { CassieClient } from '../../structures/CassieClient.js';
import { sendError } from '../../components/statusMessages.js';
import { buildWhoWouldWinPayload } from '../../components/fun/whowouldwin.js';
import { resolveUser } from '../../helpers/userResolver.js';

export const options = {
  name:        'whowouldwin',
  aliases:     ['wwn'] as string[],
  description: 'See who would win in a battle between two users.',
  usage:       'whowouldwin\n' +
               'whowouldwin random\n' +
               'whowouldwin <@user|ID|username>\n' +
               'whowouldwin <@user|ID|username> random\n' +
               'whowouldwin <@user1|ID|username> <@user2|ID|username>',
  category:    'fun',
  owner:       false,
  cooldown:    5,
};

function isRandomKeyword(arg: string): boolean {
  return arg.trim().toLowerCase() === 'random';
}

async function pickRandomMember(guild: any, excludeIds: string[]): Promise<any | null> {
  const members = await guild.members.fetch({ limit: 1000 }).catch((): null => null);
  if (!members) return null;

  const eligible: any[] = [...members.values()].filter(
    (member: any) => !member.user.bot && !excludeIds.includes(member.user.id),
  );
  if (eligible.length === 0) return null;
  return eligible[Math.floor(Math.random() * eligible.length)].user;
}

export async function prefixExecute(
  message: any,
  args:    string[],
  client:  CassieClient,
): Promise<any> {
  const ctx = { message };

  if (!message.guild) return sendError(ctx, 'This command can only be used in a server.');

  let user1: any = message.author;
  let user2: any;

  if (args.length === 0 || (args.length === 1 && isRandomKeyword(args[0]))) {
    user2 = await pickRandomMember(message.guild, [message.author.id]);
    if (!user2) return sendError(ctx, 'There are no other non-bot members to battle.');
  } else if (args.length === 1) {
    const resolved = await resolveUser(client, message.guild, args[0]);
    if (!resolved) return sendError(ctx, `Could not find a user matching \`${args[0]}\`.`);
    user2 = resolved;
  } else if (isRandomKeyword(args[0]) && isRandomKeyword(args[1])) {
    user1 = await pickRandomMember(message.guild, []);
    if (!user1) return sendError(ctx, 'There are no non-bot members to battle.');
    user2 = await pickRandomMember(message.guild, [user1.id]);
    if (!user2) return sendError(ctx, 'There are not enough non-bot members to battle.');
  } else if (isRandomKeyword(args[1])) {
    user1 = await resolveUser(client, message.guild, args[0]);
    if (!user1) return sendError(ctx, `Could not find a user matching \`${args[0]}\`.`);
    user2 = await pickRandomMember(message.guild, [user1.id]);
    if (!user2) return sendError(ctx, 'There are no other non-bot members to battle.');
  } else if (isRandomKeyword(args[0])) {
    user1 = await resolveUser(client, message.guild, args[1]);
    if (!user1) return sendError(ctx, `Could not find a user matching \`${args[1]}\`.`);
    user2 = await pickRandomMember(message.guild, [user1.id]);
    if (!user2) return sendError(ctx, 'There are no other non-bot members to battle.');
  } else {
    const [r1, r2] = await Promise.all([
      resolveUser(client, message.guild, args[0]),
      resolveUser(client, message.guild, args[1]),
    ]);
    if (!r1) return sendError(ctx, `Could not find a user matching \`${args[0]}\`.`);
    if (!r2) return sendError(ctx, `Could not find a user matching \`${args[1]}\`.`);
    user1 = r1;
    user2 = r2;
  }

  if (user1.id === user2.id) return sendError(ctx, 'Pick two different users.');

  const payload = await buildWhoWouldWinPayload({
    user1,
    user2,
    guild: message.guild,
    botId: client.user?.id,
    invokerUsername: message.author.username,
  });
  try {
    return await message.channel.send(payload);
  } catch (error: any) {
    const detail = String(error?.message ?? error);
    if (!detail.includes('MESSAGE_REFERENCE_UNKNOWN_MESSAGE')) throw error;

    // A stale reply reference should not prevent the result from being sent.
    return message.channel.send({ ...payload, reply: undefined }).catch((): null => null);
  }
}

export async function slashExecute(interaction: any, client: CassieClient): Promise<any> {
  await interaction.deferReply();

  const rawTarget  = interaction.options.getUser('user') as any;
  const rawTarget2 = interaction.options.getUser('user2') ?? null;

  let user1: any;
  let user2: any;

  if (!rawTarget && !rawTarget2) {
    if (!interaction.guild)
      return sendError({ interaction }, 'Provide a user to battle with when using this outside a server.');
    user2 = await pickRandomMember(interaction.guild, [interaction.user.id]);
    if (!user2) return sendError({ interaction }, 'There are no other non-bot members to battle.');
    user1 = interaction.user;
  } else if (rawTarget2) {
    user1 = rawTarget;
    user2 = rawTarget2;
  } else {
    user1 = interaction.user;
    user2 = rawTarget;
  }

  if (user1.id === user2.id)
    return sendError({ interaction }, 'Pick two different users.');

  const payload = await buildWhoWouldWinPayload({
    user1,
    user2,
    guild: interaction.guild,
    botId: client.user?.id,
    invokerUsername: interaction.user.username,
  });
  return interaction.editReply(payload);
}
