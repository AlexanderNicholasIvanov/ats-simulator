// Date recognition for resume experience sections.
// Every date-looking token is classified by the format it is written in; a parser profile
// can only read the formats it lists (plus 'Present' / 'Current' / 'Now').
import type { DateFormatId } from '../types.ts';

export const ALL_DATE_FORMATS: DateFormatId[] = [
  'MM/YYYY',
  'Mon YYYY',
  'Month YYYY',
  'YYYY',
  'MM-YYYY',
  'YYYY-MM',
  'Season YYYY',
];

const MONTHS_FULL = [
  'january',
  'february',
  'march',
  'april',
  'may',
  'june',
  'july',
  'august',
  'september',
  'october',
  'november',
  'december',
];
const MONTHS_ABBR = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const SEASON_MONTH: Record<string, string> = {
  spring: '03',
  summer: '06',
  fall: '09',
  autumn: '09',
  winter: '12',
};

const MONTH_ALT = [...MONTHS_FULL, 'sept', ...MONTHS_ABBR].join('|');
const SEASON_ALT = Object.keys(SEASON_MONTH).join('|');
const PRESENT_ALT = 'present|current|now|today';

/** One date token, no boundaries. Order matters: longer forms first. */
const TOKEN_SRC =
  `(?:(?:${MONTH_ALT})\\.?\\s+\\d{4}` +
  `|(?:${SEASON_ALT})\\s+\\d{4}` +
  `|\\d{1,2}\\/\\d{4}` +
  `|\\d{1,2}-\\d{4}` +
  `|\\d{4}-\\d{2}` +
  `|\\d{4})`;
const BOUNDED_TOKEN_SRC = `(?<![\\w/])${TOKEN_SRC}(?![\\w/])`;
const END_SRC = `(?:${BOUNDED_TOKEN_SRC}|\\b(?:${PRESENT_ALT})\\b)`;
const RANGE_SEP_SRC = `\\s*(?:-|–|—|\\bto\\b|\\buntil\\b)\\s*`;

const RANGE_RE = () => new RegExp(`(${BOUNDED_TOKEN_SRC})${RANGE_SEP_SRC}(${END_SRC})`, 'gi');
const TOKEN_RE = () => new RegExp(BOUNDED_TOKEN_SRC, 'gi');

export interface DateRangeHit {
  /** the full matched range text, e.g. 'Mar 2021 - Present' */
  raw: string;
  index: number;
  startRaw: string;
  endRaw: string;
}

export interface ClassifiedDate {
  /** formats that can read this token (May 2021 is both 'Mon YYYY' and 'Month YYYY') */
  formats: DateFormatId[];
  /** normalised 'YYYY-MM' or 'YYYY'; undefined when the token is not a valid date (e.g. 13/2021) */
  normalized?: string;
}

function plausibleYear(y: string): boolean {
  const n = Number(y);
  return n >= 1900 && n <= 2100;
}

function monthOk(m: string): string | undefined {
  const n = Number(m);
  return n >= 1 && n <= 12 ? String(n).padStart(2, '0') : undefined;
}

/** Classify a single date token (no range). Returns undefined when it does not look like a date. */
export function classifyDate(token: string): ClassifiedDate | undefined {
  const t = token.trim().toLowerCase().replace(/\s+/g, ' ');
  let m: RegExpMatchArray | null;
  if ((m = t.match(/^([a-z]+)\.? (\d{4})$/))) {
    const word = m[1];
    const year = m[2];
    if (word in SEASON_MONTH) {
      return {
        formats: ['Season YYYY'],
        normalized: plausibleYear(year) ? `${year}-${SEASON_MONTH[word]}` : undefined,
      };
    }
    const full = MONTHS_FULL.indexOf(word);
    const abbr = MONTHS_ABBR.indexOf(word === 'sept' ? 'sep' : word);
    if (full < 0 && abbr < 0) return undefined;
    const monthIndex = full >= 0 ? full : abbr;
    const formats: DateFormatId[] =
      full >= 0 && abbr >= 0 ? ['Mon YYYY', 'Month YYYY'] : full >= 0 ? ['Month YYYY'] : ['Mon YYYY'];
    return {
      formats,
      normalized: plausibleYear(year)
        ? `${year}-${String(monthIndex + 1).padStart(2, '0')}`
        : undefined,
    };
  }
  if ((m = t.match(/^(\d{1,2})([/-])(\d{4})$/))) {
    const mm = monthOk(m[1]);
    return {
      formats: [m[2] === '/' ? 'MM/YYYY' : 'MM-YYYY'],
      normalized: mm && plausibleYear(m[3]) ? `${m[3]}-${mm}` : undefined,
    };
  }
  if ((m = t.match(/^(\d{4})-(\d{2})$/))) {
    // '2018-19' is a year range (YYYY-YY), not month 19
    const yearRange = shortYearEnd(m[1], m[2]);
    if (!monthOk(m[2]) && yearRange) return { formats: ['YYYY'], normalized: m[1] };
    const mm = monthOk(m[2]);
    return {
      formats: ['YYYY-MM'],
      normalized: mm && plausibleYear(m[1]) ? `${m[1]}-${mm}` : undefined,
    };
  }
  if ((m = t.match(/^(\d{4})$/))) {
    if (!plausibleYear(m[1])) return undefined;
    return { formats: ['YYYY'], normalized: m[1] };
  }
  return undefined;
}

export function isPresent(token: string): boolean {
  return new RegExp(`^(?:${PRESENT_ALT})$`, 'i').test(token.trim());
}

/**
 * Parse one date token with the given formats.
 * Returns 'present', a normalised date, or undefined when none of the formats reads it.
 */
export function parseDate(token: string, formats: DateFormatId[]): string | undefined {
  if (isPresent(token)) return 'present';
  const c = classifyDate(token);
  if (!c || !c.normalized) return undefined;
  return c.formats.some((f) => formats.includes(f)) ? c.normalized : undefined;
}

/** All date ranges in a line, e.g. 'Mar 2021 - Present', '2016 – 2018', '06/2018 to 02/2021'. */
export function findDateRanges(line: string): DateRangeHit[] {
  const hits: DateRangeHit[] = [];
  for (const m of line.matchAll(RANGE_RE())) {
    hits.push({ raw: m[0], index: m.index ?? 0, startRaw: m[1], endRaw: m[2] });
  }
  // YYYY-YY year ranges: '2018-19' (YY > 12), or any 'YYYY – YY' / 'YYYY to YY' with a spaced or
  // dash separator. The end is expanded to four digits ('19' -> '2019') and read as 'YYYY'.
  for (const m of line.matchAll(SHORT_YEAR_RANGE_RE())) {
    const index = m.index ?? 0;
    if (hits.some((h) => index < h.index + h.raw.length && h.index < index + m[0].length)) continue;
    const plainHyphen = m[2] === '-';
    if (plainHyphen && monthOk(m[3])) continue; // '2021-03' is YYYY-MM
    const end = shortYearEnd(m[1], m[3]);
    if (!end) continue;
    hits.push({ raw: m[0], index, startRaw: m[1], endRaw: end });
  }
  return hits.sort((a, b) => a.index - b.index);
}

const SHORT_YEAR_RANGE_RE = () => /(?<![\w/])(\d{4})(\s*[-–—]\s*|\s+to\s+)(\d{2})(?![\w/])/gi;

/** '2018' + '19' -> '2019'; undefined unless the end year is after the start year and plausible. */
function shortYearEnd(start: string, yy: string): string | undefined {
  const s = Number(start);
  if (!plausibleYear(start)) return undefined;
  let e = Math.floor(s / 100) * 100 + Number(yy);
  if (e <= s) e += 100;
  return e > s && e - s <= 20 && plausibleYear(String(e)) ? String(e) : undefined;
}

/** Every date-looking token in a line (years 1900-2100, month/season + year, numeric forms). */
export function findDateTokens(line: string): string[] {
  const out: string[] = [];
  for (const m of line.matchAll(TOKEN_RE())) {
    if (classifyDate(m[0])) out.push(m[0]);
  }
  return out;
}

/** True when the token looks like a date but none of the formats reads it. */
export function isUnreadable(token: string, formats: DateFormatId[]): boolean {
  if (isPresent(token)) return false;
  return classifyDate(token) !== undefined && parseDate(token, formats) === undefined;
}
