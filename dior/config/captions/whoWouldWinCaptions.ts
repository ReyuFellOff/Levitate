// xoxo/config/captions/whoWouldWinCaptions.ts
//
// Captions for the $whowouldwin command. Marked captions have higher odds.

const whoWouldWinCaptionBands = [
  ['The winner takes it all, the loser has to fall.', 4],
  ['May thy knife chip and shatter!', 4],
  ['Top 10 anime battles that went completely wrong.', 3],
  ['A battle of wits between two unarmed people.', 1],
  ['Neither of you prepared for this, did you?', 3],
  ["The universe isn't ready for this level of mid.", 1],
  ['99% luck, 1% skill, 100% pure chaos.', 2],
  ["It's officially personal now.", 1],
  ['Who let these two into the same ring?', 1],
  ['Asking for a friend... who has your money on whom?', 1],
  ['This is about to get messy.', 1],
  ['Two enter, one leaves. No pressure.', 1],
  ["May the odds be ever in your favor (they won't be).", 1],
  ['Only one of you is walking away with bragging rights.', 1],
] as const;

export function pickWhoWouldWinCaption(): string {
  const totalWeight = whoWouldWinCaptionBands.reduce((sum, [, weight]) => sum + weight, 0);
  let roll = Math.floor(Math.random() * totalWeight);
  for (const [caption, weight] of whoWouldWinCaptionBands) {
    roll -= weight;
    if (roll < 0) return caption;
  }
  return whoWouldWinCaptionBands[0][0];
}

export function getWhoWouldWinBotCaption(botName: string): string {
  return `Running my command and thinking I won't rig it to favour myself? ${botName} always wins!`;
}