// xoxo/helpers/parseDuration.ts
//
// Parse human-readable duration strings into milliseconds and back.
// Supported units: s (seconds), m (minutes), h (hours), d (days), w (weeks)
// Accepts mixed units: "1h30m", "2d12h", "7d"

const UNIT_MS: Record<string, number> = {
  s: 1_000,
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000,
  w: 604_800_000,
};

/**
 * Parse a duration string (e.g. "10m", "1h30m", "7d") into milliseconds.
 * Returns `null` if the string is invalid or resolves to zero.
 */
export function parseDuration(input: string): number | null {
  const str = input.trim().toLowerCase();
  const re  = /(\d+)\s*([smhdw])/g;

  let ms      = 0;
  let matched = false;
  let match: RegExpExecArray | null;

  while ((match = re.exec(str)) !== null) {
    const amount = parseInt(match[1], 10);
    const unit   = UNIT_MS[match[2]];
    if (!unit || amount <= 0) return null;
    ms     += amount * unit;
    matched = true;
  }

  return matched && ms > 0 ? ms : null;
}

/**
 * Format milliseconds into a readable string like "1 hour 30 minutes".
 */
export function formatDuration(ms: number): string {
  const parts: string[] = [];
  const units: [number, string, string][] = [
    [604_800_000, 'week',   'weeks'  ],
    [ 86_400_000, 'day',    'days'   ],
    [  3_600_000, 'hour',   'hours'  ],
    [     60_000, 'minute', 'minutes'],
    [      1_000, 'second', 'seconds'],
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
