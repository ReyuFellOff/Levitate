// xoxo/helpers/parseDuration.ts
//
// Parse human-readable duration strings into milliseconds and back.
// Supported units: s (seconds), m (minutes), h (hours), d (days), w (weeks),
//                  mo (months), y (years), dec (decades)
// Accepts mixed units: "1h30m", "2d12h", "7d"
// Max: 10 decades (315,360,000,000 ms)

const DECADE_MS = 10 * 365 * 24 * 60 * 60 * 1_000; // 10 years in ms
const MAX_MS    = 10 * DECADE_MS;                    // max 10 decades

const UNIT_MS: Record<string, number> = {
  s:       1_000,
  m:       60_000,
  h:       3_600_000,
  d:       86_400_000,
  w:       604_800_000,
  mo:      30 * 86_400_000,
  y:       365 * 86_400_000,
  dec:     DECADE_MS,
};

// Also accept full words / abbreviations as aliases
const UNIT_ALIASES: Record<string, string> = {
  sec: 's', secs: 's', second: 's', seconds: 's',
  min: 'm', mins: 'm', minute: 'm', minutes: 'm',
  hr: 'h', hrs: 'h', hour: 'h', hours: 'h',
  day: 'd', days: 'd',
  week: 'w', weeks: 'w',
  month: 'mo', months: 'mo',
  yr: 'y', yrs: 'y', year: 'y', years: 'y',
  decade: 'dec', decades: 'dec',
};

/**
 * Parse a duration string (e.g. "10m", "1h30m", "7d", "1dec") into milliseconds.
 * Returns `null` if the string is invalid, resolves to zero, or exceeds 10 decades.
 */
export function parseDuration(input: string): number | null {
  const str = input.trim().toLowerCase();
  // Match numeric+unit tokens — support multi-char unit names (mo, dec, week…)
  const re  = /(\d+)\s*([a-z]+)/g;

  let ms      = 0;
  let matched = false;
  let consumed = 0;
  let match: RegExpExecArray | null;

  while ((match = re.exec(str)) !== null) {
    const amount = parseInt(match[1], 10);
    const rawUnit = match[2];
    const unitKey = UNIT_ALIASES[rawUnit] ?? rawUnit;
    const unitMs  = UNIT_MS[unitKey];
    if (!unitMs || amount <= 0) return null;
    ms     += amount * unitMs;
    matched = true;
    consumed = match.index + match[0].length;
  }

  if (!matched || ms <= 0) return null;

  // Reject trailing non-whitespace garbage (e.g. "5xyz" where xyz is unknown)
  if (consumed < str.replace(/\s+/g, '').length) return null;

  if (ms > MAX_MS) return null;

  return ms;
}

/**
 * Format milliseconds into a readable string like "1 hour 30 minutes".
 */
export function formatDuration(ms: number): string {
  const parts: string[] = [];
  const units: [number, string, string][] = [
    [10 * 365 * 86_400_000, 'decade',  'decades' ],
    [     365 * 86_400_000, 'year',    'years'   ],
    [      30 * 86_400_000, 'month',   'months'  ],
    [         604_800_000,  'week',    'weeks'   ],
    [          86_400_000,  'day',     'days'    ],
    [           3_600_000,  'hour',    'hours'   ],
    [              60_000,  'minute',  'minutes' ],
    [               1_000,  'second',  'seconds' ],
  ];

  for (const [unitMs, singular, plural] of units) {
    if (ms >= unitMs) {
      const count = Math.floor(ms / unitMs);
      ms %= unitMs;
      parts.push(`${count} ${count === 1 ? singular : plural}`);
    }
  }

  return parts.length > 0 ? parts.join(' ') : '0 seconds';
}
