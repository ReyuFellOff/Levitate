// xoxo/commands/fun/rizz.ts
//
// $rizz — rates how much rizz a user has.
//
// Usage:
//   $rizz              — rates the author
//   $rizz <@user|ID>   — rates the given user
//
// Special cases:
//   • Developer (Reyansh) always gets Infinite%.
//   • A developer-set bias (via $bias) overrides the roll for a specific user.
//   • VERY rarely (1 % chance) the percentage can exceed 100%.
//   • Percentage is random every time (not deterministic).

import type { CassieClient } from '../../structures/CassieClient.js';
import { sendError } from '../../components/statusMessages.js';
import { buildRizzPayload } from '../../components/fun/rizz.js';
import { resolveUser } from '../../helpers/userResolver.js';
import { resolveRatingPct } from '../../helpers/ratingBias.js';

export const options = {
  name:        'howrizz',
  aliases:     ['rizz'] as string[],
  description: 'See how much rizz someone has.',
  usage:       'rizz\nrizz <@user|ID|username>',
  category:    'fun',
  owner:       false,
  cooldown:    5,
};

function rollRizz(): number {
  if (Math.random() < 0.01) {
    return 101 + Math.floor(Math.random() * 30); // 101–130
  }
  return Math.floor(Math.random() * 101); // 0–100
}

export async function prefixExecute(
  message: any,
  args:    string[],
  client:  CassieClient,
): Promise<any> {
  const ctx = { message };

  if (!message.guild) return sendError(ctx, 'This command can only be used in a server.');

  let user: any;

  if (args.length === 0) {
    user = message.author;
  } else {
    const resolved = await resolveUser(client, message.guild, args[0]);
    if (!resolved) return sendError(ctx, `Could not find a user matching \`${args[0]}\`.`);
    user = resolved;
  }

  const member = await message.guild.members.fetch(user.id).catch((): null => null);
  const displayName: string = member?.displayName ?? user.globalName ?? user.username ?? '?';

  const pct = await resolveRatingPct(client, 'rizz', user.id, rollRizz);

  const payload = await buildRizzPayload({ user, pct, displayName });
  return message.channel.send(payload);
}

export async function slashExecute(interaction: any, client: CassieClient): Promise<any> {
  await interaction.deferReply();

  const rawUser = interaction.options.getUser('user') ?? interaction.user;
  const member  = interaction.guild
    ? await interaction.guild.members.fetch(rawUser.id).catch((): null => null)
    : null;
  const displayName: string = (member as any)?.displayName ?? rawUser.globalName ?? rawUser.username ?? '?';

  const pct = await resolveRatingPct(client, 'rizz', rawUser.id, rollRizz);
  const payload = await buildRizzPayload({ user: rawUser, pct, displayName });
  return interaction.editReply(payload);
}
