// xoxo/commands/fun/guessthenumber.ts
//
// $guessthenumber — the bot picks a random number and you get limited guesses.
//
// Usage:
//   $guessthenumber          — guess 1–100, 6 attempts
//   $guessthenumber <max>    — guess 1–max, 6 attempts
//
// Flow:
//   1. Bot picks a random number in [1, max].
//   2. Author replies in-channel with numeric guesses (30s per guess).
//   3. Bot replies "higher"/"lower" until the guess is correct or attempts run out.

import type { CassieClient } from '../../structures/CassieClient.js';
import { sendError } from '../../components/statusMessages.js';

export const options = {
  name:        'guessthenumber',
  aliases:     ['gtn'] as string[],
  description: 'Try to guess the number the bot is thinking of.',
  usage:       'guessthenumber [max]',
  category:    'fun',
  owner:       false,
  cooldown:    5,
};

const MAX_ATTEMPTS = 6;
const GUESS_TIME    = 30_000; // 30s per guess

export async function prefixExecute(
  message: any,
  args:    string[],
  _client: CassieClient,
): Promise<any> {
  const ctx = { message };

  if (!message.guild) return sendError(ctx, 'This command can only be used in a server.');

  let max = 100;
  if (args.length > 0) {
    const parsed = parseInt(args[0], 10);
    if (!Number.isFinite(parsed) || parsed < 2 || parsed > 1_000_000) {
      return sendError(ctx, 'Please provide a valid maximum between 2 and 1,000,000.');
    }
    max = parsed;
  }

  const target = 1 + Math.floor(Math.random() * max);
  let attemptsLeft = MAX_ATTEMPTS;

  await message.channel.send(
    `🔢 I'm thinking of a number between **1** and **${max}**. You have **${MAX_ATTEMPTS}** guesses — type a number in this channel!`,
  );

  while (attemptsLeft > 0) {
    const collected = await message.channel
      .awaitMessages({
        filter: (m: any) => m.author.id === message.author.id && /^\d+$/.test(m.content.trim()),
        max: 1,
        time: GUESS_TIME,
        errors: ['time'],
      })
      .catch((): null => null);

    if (!collected || collected.size === 0) {
      return message.channel.send(`⌛ Time's up! The number was **${target}**.`);
    }

    const guessMsg = collected.first();
    const guess = parseInt(guessMsg.content.trim(), 10);
    attemptsLeft--;

    if (guess === target) {
      return message.channel.send(
        `🎉 **${message.member?.displayName ?? message.author.username}** guessed it! The number was **${target}**. (${MAX_ATTEMPTS - attemptsLeft} attempt${MAX_ATTEMPTS - attemptsLeft === 1 ? '' : 's'} used)`,
      );
    }

    if (attemptsLeft === 0) {
      return message.channel.send(`❌ Out of attempts! The number was **${target}**.`);
    }

    const hint = guess < target ? 'higher ⬆️' : 'lower ⬇️';
    await message.channel.send(`Try ${hint}. (${attemptsLeft} attempt${attemptsLeft === 1 ? '' : 's'} left)`);
  }
}
