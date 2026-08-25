// xoxo/commands/fun/gay.ts
//
// $gay — rates how gay a user is.
//
// Usage:
//   $gay              — rates the author
//   $gay <@user|ID>   — rates the given user
//
// Special cases:
//   • Developer (Reyansh) always gets -1%.
//   • A developer-set bias (via $bias) overrides the roll — bias CAN be negative.
//   • Random roll is always 0–100; only bias or the developer override produce negatives.
//   • Percentage is random every time (not deterministic).

import type { CassieClient } from '../../structures/CassieClient.js';
import { sendError } from '../../components/statusMessages.js';
import { buildGayPayload } from '../../components/fun/gay.js';
import { resolveUser } from '../../helpers/userResolver.js';
import { resolveRatingPct } from '../../helpers/ratingBias.js';

export const options = {
  name:        'howgay',
  aliases:     ['gay'] as string[],
  description: 'See how gay someone is.',
  usage:       'gay\ngay <@user|ID|username>',
  category:    'fun',
  owner:       false,
  cooldown:    5,
};

// ── Percentage roll ───────────────────────────────────────────────────────────
// Always 0–100 for regular users. Only bias or the dev override can go negative.
function rollGay(): number {
  return Math.floor(Math.random() * 101); // 0–100
}

// ── Prefix execute ────────────────────────────────────────────────────────────

export async function prefixExecute(
  message: any,
  args:    string[],
  client:  CassieClient,
): Promise<any> {
  const ctx = { message };

  if (!message.guild) return sendError(ctx, 'This command can only be used in a server.');

  // ── Resolve target user ───────────────────────────────────────────────────
  let user: any;

  if (args.length === 0) {
    user = message.author;
  } else {
    const resolved = await resolveUser(client, message.guild, args[0]);
    if (!resolved) return sendError(ctx, `Could not find a user matching \`${args[0]}\`.`);
    user = resolved;
  }

  // ── Get server display name ───────────────────────────────────────────────
  const member = await message.guild.members.fetch(user.id).catch((): null => null);
  const displayName: string = member?.displayName ?? user.globalName ?? user.username ?? '?';

  // ── Determine percentage ──────────────────────────────────────────────────
  const pct = await resolveRatingPct(client, 'gay', user.id, rollGay);

  const payload = await buildGayPayload({ user, pct, displayName });
  return message.channel.send(payload);
}

export async function slashExecute(interaction: any, client: CassieClient): Promise<any> {
  await interaction.deferReply();

  const rawUser = interaction.options.getUser('user') ?? interaction.user;
  const member  = interaction.guild
    ? await interaction.guild.members.fetch(rawUser.id).catch((): null => null)
    : null;
  const displayName: string = (member as any)?.displayName ?? rawUser.globalName ?? rawUser.username ?? '?';

  const pct = await resolveRatingPct(client, 'gay', rawUser.id, rollGay);
  const payload = await buildGayPayload({ user: rawUser, pct, displayName });
  return interaction.editReply(payload);
}
