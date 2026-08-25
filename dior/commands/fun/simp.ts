// xoxo/commands/fun/simp.ts
//
// $simp — rates how much of a simp a user is.
//
// Usage:
//   $simp              — rates the author
//   $simp <@user|ID>   — rates the given user
//
// Special cases:
//   • Developer (Reyansh) always gets Infinite%.
//   • A developer-set bias (via $bias) overrides the roll for a specific user.
//   • VERY rarely (1 % chance) the percentage can exceed 100%.
//   • Percentage is random every time (not deterministic).

import type { CassieClient } from '../../structures/CassieClient.js';
import { sendError } from '../../components/statusMessages.js';
import { buildSimpPayload } from '../../components/fun/simp.js';
import { resolveUser } from '../../helpers/userResolver.js';
import { resolveRatingPct } from '../../helpers/ratingBias.js';

export const options = {
  name:        'howsimp',
  aliases:     ['simp'] as string[],
  description: 'See how much of a simp someone is.',
  usage:       'simp\nsimp <@user|ID|username>',
  category:    'fun',
  owner:       false,
  cooldown:    5,
};

function rollSimp(): number {
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

  const pct = await resolveRatingPct(client, 'simp', user.id, rollSimp);

  const payload = await buildSimpPayload({ user, pct, displayName });
  return message.channel.send(payload);
}

export async function slashExecute(interaction: any, client: CassieClient): Promise<any> {
  await interaction.deferReply();

  const rawUser = interaction.options.getUser('user') ?? interaction.user;
  const member  = interaction.guild
    ? await interaction.guild.members.fetch(rawUser.id).catch((): null => null)
    : null;
  const displayName: string = (member as any)?.displayName ?? rawUser.globalName ?? rawUser.username ?? '?';

  const pct = await resolveRatingPct(client, 'simp', rawUser.id, rollSimp);
  const payload = await buildSimpPayload({ user: rawUser, pct, displayName });
  return interaction.editReply(payload);
}
