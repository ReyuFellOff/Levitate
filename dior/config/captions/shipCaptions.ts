// xoxo/config/shipCaptions.ts
//
// Captions for the $ship command, organised by 10 % bands.
// pickCaption() picks randomly each time — same pair can get different
// captions on repeat calls, which is intentional.
//
// Inner asterisks are escaped (\*) so they don't clash with the outer
// italic wrapper (* caption *) used in the CV2 message.

export interface ShipCaptionBand {
  min: number; // inclusive
  max: number; // inclusive
  captions: string[];
}

export const shipCaptionBands: ShipCaptionBand[] = [
  {
    min: 0, max: 9,
    captions: [
      'The universe looked at this ship and said \\*absolutely not.\\*',
      '404: Love not found. Try again in another lifetime.',
      'The stars collectively sighed and went home.',
      'Even a coin flip would\'ve been more romantic.',
      'These two couldn\'t agree on a pizza topping, let alone a future.',
      'The chemistry lab results came back: null.',
      'Not even enemies-to-lovers could save this one.',
      'God closed every door, then bricked up the windows too.',
    ],
  },
  {
    min: 10, max: 19,
    captions: [
      'A very firm handshake. At best.',
      'The vibes are off. \\*Way\\* off.',
      'They could survive a car ride together. Barely.',
      'Somewhere in a parallel universe this is a love story. Not this one.',
      'Less \\*opposites attract\\*, more \\*opposites repel.\\*',
      'They make better strangers than anything else.',
      'The situationship has situationships.',
      'Nature said no. The data agrees.',
    ],
  },
  {
    min: 20, max: 29,
    captions: [
      'Strong \\*we met once at a party\\* energy.',
      'Technically they breathe the same air. That\'s something.',
      'A slow-burn potential — but the wood is damp.',
      'Could work... with a lot of therapy and questionable life decisions.',
      'The spark exists. It\'s just buried very, very deep.',
      'More of a \\*maybe\\* than a \\*yes\\* — but not quite a \\*no\\* either.',
      'Friends who should probably talk more and overthink less.',
      'There\'s a plot here. It just hasn\'t found its genre yet.',
    ],
  },
  {
    min: 30, max: 39,
    captions: [
      'There\'s a spark buried under all that rubble.',
      'They\'d argue constantly but in a weirdly entertaining way.',
      'The potential is there. The courage? Still loading.',
      'Not soulmates yet — but something worth exploring.',
      'A whole lot of \\*what if\\* and not enough \\*let\'s find out.\\*',
      'They give each other looks that say a lot more than words.',
      'The tension is there. Someone just hasn\'t named it yet.',
      'Close enough to wonder. Far enough to hesitate.',
    ],
  },
  {
    min: 40, max: 49,
    captions: [
      'Fifty-fifty odds — flip a coin, chase your heart.',
      'The universe is genuinely on the fence about this one.',
      'A story that hasn\'t decided how it ends yet.',
      'One good conversation away from everything changing.',
      'They\'re both thinking the same thing. Neither will say it first.',
      'Accidentally flirting every time without realising it.',
      'The \\*almost\\* is loud. Someone needs to close the gap.',
      'Not quite magnetised — but definitely not repelling either.',
    ],
  },
  {
    min: 50, max: 59,
    captions: [
      'More than a little something, less than forever — for now.',
      'The slow dance has started. Will either of them notice?',
      'Halfway between \\*what if\\* and \\*why not.\\*',
      'Cute enough to ship, spicy enough to keep watching.',
      'They\'re both playing it cool. Neither is actually cool.',
      'Late-night texts that mean more than they\'ll ever admit.',
      'Mutual pining: a tale as old as time.',
      'The pull is real. The timing just needs a nudge.',
    ],
  },
  {
    min: 60, max: 69,
    captions: [
      'Something is definitely brewing here.',
      'They orbit each other without even knowing it.',
      'Strong \\*we should hang out more\\* energy.',
      'There\'s a \\*we\\* forming whether they like it or not.',
      'They\'d deny everything. Their faces would not.',
      'Give it a week. Maybe two. Then it\'s obvious to everyone.',
      'The kind of connection songs get quietly written about.',
      'They bring out a version of each other no one else sees.',
    ],
  },
  {
    min: 70, max: 79,
    captions: [
      'The heart has already decided. The head is still catching up.',
      'Deeply connected and probably still in denial.',
      'High compatibility. Very high chaos potential.',
      'The \\*just friends\\* phase is barely holding together.',
      'They\'d move mountains for each other and call it no big deal.',
      'Everyone around them already knows. They\'re the last to find out.',
      'Their playlists overlap almost perfectly. That says everything.',
      'One honest conversation away from something real.',
    ],
  },
  {
    min: 80, max: 89,
    captions: [
      'Someone write a fanfic. Seriously, right now.',
      'The chemistry is palpable from across the room.',
      'These two? They\'re inevitable.',
      'One glance. One smile. That\'s genuinely all it takes.',
      'The universe has been rooting for this since day one.',
      'If this isn\'t endgame, the story isn\'t over yet.',
      'They finish each other\'s — anyway, you get it.',
      'Absolutely unhinged levels of romantic tension.',
    ],
  },
  {
    min: 90, max: 100,
    captions: [
      'Certified soulmates. The universe approves.',
      'If they\'re not together yet — \\*what are they even waiting for?\\*',
      'No notes. Absolutely no notes.',
      'Fated. Written in the stars before either of them existed.',
      'They probably complete each other\'s sentences without thinking.',
      'This ship is canon and the universe has the receipts.',
      'The matching outfits are already on the way.',
      'Cosmically aligned. Disgustingly compatible. Good for them.',
    ],
  },
];

/** Captions for self-ship. */
export const selfShipCaptions: string[] = [
  'Self-love energy is officially off the charts.',
  'The main character found their number one fan: themselves.',
  'Loving yourself first — and doing it exceptionally well.',
  'No one loves them more than they do. As it should be.',
  'Most people search a lifetime. This one already found the one.',
  'The relationship status is \\*thriving\\*, thank you very much.',
];

/**
 * Pick a random caption for the given percentage band.
 * Intentionally random each call so the same pair sees variety.
 */
export function pickCaption(pct: number): string {
  const band = shipCaptionBands.find(b => pct >= b.min && pct <= b.max)
    ?? shipCaptionBands[shipCaptionBands.length - 1];
  return band.captions[Math.floor(Math.random() * band.captions.length)];
}

/** Pick a random self-ship caption. */
export function pickSelfCaption(): string {
  return selfShipCaptions[Math.floor(Math.random() * selfShipCaptions.length)];
}
