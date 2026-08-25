// xoxo/commands/fun/intelligence.ts
//
// $intelligent / $iq — rates how intelligent a user is.
//
// Usage:
//   $intelligent              — rates the author
//   $intelligent <@user|ID>   — rates the given user
//
// Special cases:
//   • Developer (Reyansh) always gets Infinite%.
//   • A developer-set bias (via $bias) overrides the roll for a specific user.
//   • VERY rarely (1 % chance) the percentage can exceed 100%.
//   • Percentage is random every time (not deterministic).

import type { CassieClient } from '../../structures/CassieClient.js';
import { sendError } from '../../components/statusMessages.js';
import { buildIntelligencePayload } from '../../components/fun/intelligence.js';
import { resolveUser } from '../../helpers/userResolver.js';
import { resolveRatingPct } from '../../helpers/ratingBias.js';

export const options = {
  name:        'howintelligent',
  aliases:     ['intelligent', 'howsmart'] as string[],
  description: 'See how intelligent someone is.',
  usage:       'intelligent\nintelligent <@user|ID|username>',
  category:    'fun',
  owner:       false,
  cooldown:    5,
};

// ── Percentage roll ───────────────────────────────────────────────────────────
// 1% chance of a rare score above 100 (101–130).
function rollIntelligence(): number {
  if (Math.random() < 0.01) {
    return 101 + Math.floor(Math.random() * 30); // 101–130
  }
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
  const pct = await resolveRatingPct(client, 'intelligent', user.id, rollIntelligence);

  const payload = await buildIntelligencePayload({ user, pct, displayName });
  return message.channel.send(payload);
}

export async function slashExecute(interaction: any, client: CassieClient): Promise<any> {
  await interaction.deferReply();

  const rawUser = interaction.options.getUser('user') ?? interaction.user;
  const member  = interaction.guild
    ? await interaction.guild.members.fetch(rawUser.id).catch((): null => null)
    : null;
  const displayName: string = (member as any)?.displayName ?? rawUser.globalName ?? rawUser.username ?? '?';

  const pct = await resolveRatingPct(client, 'intelligent', rawUser.id, rollIntelligence);
  const payload = await buildIntelligencePayload({ user: rawUser, pct, displayName });
  return interaction.editReply(payload);
}
