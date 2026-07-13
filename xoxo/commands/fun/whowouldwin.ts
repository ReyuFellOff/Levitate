// xoxo/commands/fun/whowouldwin.ts
//
// $whowouldwin — pits two users against each other, deterministic "winner".
//
// Usage:
//   $whowouldwin <@user>                 — author vs user
//   $whowouldwin <@user1> <@user2>       — user1 vs user2

import type { LevitateClient } from '../../structures/LevitateClient.js';
import { sendError } from '../../components/statusMessages.js';
import { buildWhoWouldWinPayload } from '../../components/fun/whowouldwin.js';
import { resolveUser } from '../../helpers/userResolver.js';

export const options = {
  name:        'whowouldwin',
  aliases:     ['wwn'] as string[],
  description: 'See who would win in a battle between two users.',
  usage:       'whowouldwin <@user|ID|username>\n' +
               'whowouldwin <@user1|ID|username> <@user2|ID|username>',
  category:    'fun',
  owner:       false,
  cooldown:    5,
};

export async function prefixExecute(
  message: any,
  args:    string[],
  client:  LevitateClient,
): Promise<any> {
  const ctx = { message };

  if (!message.guild) return sendError(ctx, 'This command can only be used in a server.');

  let user1: any = message.author;
  let user2: any;

  if (args.length === 0) {
    return sendError(ctx, 'Please mention at least one user to battle.');
  } else if (args.length === 1) {
    const resolved = await resolveUser(client, message.guild, args[0]);
    if (!resolved) return sendError(ctx, `Could not find a user matching \`${args[0]}\`.`);
    user2 = resolved;
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

  const payload = await buildWhoWouldWinPayload({ user1, user2, invokerUsername: message.author.username });
  return message.channel.send(payload);
}

export async function slashExecute(interaction: any, client: LevitateClient): Promise<any> {
  await interaction.deferReply();
  if (!interaction.guild) return sendError({ interaction }, 'This command can only be used in a server.');

  const rawTarget  = interaction.options.getUser('user') as any;
  const rawTarget2 = interaction.options.getUser('user2') ?? null;

  let user1: any;
  let user2: any;

  if (rawTarget2) {
    user1 = rawTarget;
    user2 = rawTarget2;
  } else {
    user1 = interaction.user;
    user2 = rawTarget;
  }

  if (user1.id === user2.id)
    return sendError({ interaction }, 'Pick two different users.');

  const payload = await buildWhoWouldWinPayload({
    user1, user2,
    invokerUsername: interaction.user.username,
  });
  return interaction.editReply(payload);
}
