// xoxo/helpers/parseBirthdayDate.ts
//
// Parses a user-supplied birthday date string into { day, month, year }.
// Multiple common formats are accepted so users aren't forced into one style.
//
// Supported formats:
//   15/04            → day/month
//   15/04/2000       → day/month/year
//   15-04, 15.04     → alternate separators (also with year)
//   2000-04-15       → ISO (year-month-day)
//   15 April         → day + month name
//   April 15         → month name + day
//   15th April 2000, April 15, 2000 → with ordinal suffix / year
//
// Month names accept full names and common abbreviations, case-insensitive.
// The year is always optional and never required for the birthday to be valid.

export interface ParsedBirthday {
  day:   number;
  month: number; // 1-12
  year:  number | null;
}

const MONTH_NAMES: Record<string, number> = {
  jan: 1, january: 1,
  feb: 2, february: 2,
  mar: 3, march: 3,
  apr: 4, april: 4,
  may: 5,
  jun: 6, june: 6,
  jul: 7, july: 7,
  aug: 8, august: 8,
  sep: 9, sept: 9, september: 9,
  oct: 10, october: 10,
  nov: 11, november: 11,
  dec: 12, december: 12,
};

const MONTH_DISPLAY_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function isValidDate(day: number, month: number, year: number | null): boolean {
  if (!Number.isInteger(day) || !Number.isInteger(month)) return false;
  if (month < 1 || month > 12) return false;
  if (day < 1 || day > 31) return false;
  // Use a leap year as the default test year so "Feb 29" always parses
  // when no year is given.
  const testYear = year ?? 2004;
  const d = new Date(testYear, month - 1, day);
  return d.getMonth() === month - 1 && d.getDate() === day;
}

/** Parse a birthday date string. Returns null if the format is unrecognised or invalid. */
export function parseBirthdayDate(input: string): ParsedBirthday | null {
  const raw = input.trim();
  if (!raw) return null;

  // ISO: YYYY-MM-DD
  let m = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) {
    const year = parseInt(m[1], 10), month = parseInt(m[2], 10), day = parseInt(m[3], 10);
    return isValidDate(day, month, year) ? { day, month, year } : null;
  }

  // Numeric with separator: DD/MM or DD/MM/YYYY (also - and .)
  m = raw.match(/^(\d{1,2})[/\-.](\d{1,2})(?:[/\-.](\d{4}))?$/);
  if (m) {
    const day = parseInt(m[1], 10), month = parseInt(m[2], 10);
    const year = m[3] ? parseInt(m[3], 10) : null;
    return isValidDate(day, month, year) ? { day, month, year } : null;
  }

  // "15 April" / "15th April" / "15 April 2000"
  m = raw.match(/^(\d{1,2})(?:st|nd|rd|th)?\s+([a-zA-Z]+)\.?,?\s*(\d{4})?$/);
  if (m) {
    const day   = parseInt(m[1], 10);
    const month = MONTH_NAMES[m[2].toLowerCase()];
    const year  = m[3] ? parseInt(m[3], 10) : null;
    if (!month) return null;
    return isValidDate(day, month, year) ? { day, month, year } : null;
  }

  // "April 15" / "April 15th" / "April 15, 2000"
  m = raw.match(/^([a-zA-Z]+)\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s*(\d{4})?$/);
  if (m) {
    const month = MONTH_NAMES[m[1].toLowerCase()];
    const day   = parseInt(m[2], 10);
    const year  = m[3] ? parseInt(m[3], 10) : null;
    if (!month) return null;
    return isValidDate(day, month, year) ? { day, month, year } : null;
  }

  return null;
}

/** Format a parsed birthday for display, e.g. "April 15" or "April 15, 2000". */
export function formatBirthday(day: number, month: number, year?: number | null): string {
  const monthName = MONTH_DISPLAY_NAMES[month - 1] ?? String(month);
  return year ? `${monthName} ${day}, ${year}` : `${monthName} ${day}`;
}
