// Pure layout helpers for PDF text: group positioned text items into lines, assign header/body/footer
// regions and detect a two-column layout. No pdf.js types here so this is easy to unit-test.
import type { Line, Region } from '../types.ts';

/** One positioned run of text. x/y in PDF points; y is the baseline's distance from the TOP of the page. */
export interface PositionedText {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PageLayout {
  /** Lines in reading order: header, body (left column, then right column), footer. */
  lines: Line[];
  twoColumn: boolean;
}

/** Items whose baselines are within this many points share a line. */
export const LINE_TOLERANCE = 2;
/** Top / bottom share of the page treated as header / footer. */
export const HEADER_FRACTION = 0.07;
export const FOOTER_FRACTION = 0.07;

const MIN_GUTTER = 12; // pt of horizontal space between columns
const MIN_COLUMN_ROWS = 3;
const MIN_OVERLAP_SHARE = 0.4; // share of body rows where both columns run side by side
const MIN_SIDE_CHAR_SHARE = 0.12; // each column must hold at least this share of the body text
/** Share of body rows allowed to cross the gutter (e.g. a full-width name banner); read as spanning lines. */
const MAX_SPANNING_SHARE = 0.15;
/** A side whose rows almost all sit on the other side's rows (row-aligned) ... */
const ALIGNED_SHARE = 0.8;
/** ... and are mostly short dates is a date margin, not a column; */
const DATE_ROW_SHARE = 0.5;
const MAX_DATE_FRAGMENT_CHARS = 32;
const DATE_LIKE = /\b(19|20)\d{2}\b|\b(present|current|now)\b/i;
/** ... nor is one with at most half the other side's rows and little of the text. */
const FRAGMENT_ROW_RATIO = 0.5;
const FRAGMENT_CHAR_SHARE = 0.25;

export function regionFor(y: number, pageHeight: number): Region {
  if (y < pageHeight * HEADER_FRACTION) return 'header';
  if (y > pageHeight * (1 - FOOTER_FRACTION)) return 'footer';
  return 'body';
}

/** Groups items into rows by baseline (within LINE_TOLERANCE), top to bottom. */
function groupRows(items: PositionedText[]): PositionedText[][] {
  const sorted = [...items].sort((a, b) => a.y - b.y || a.x - b.x);
  const rows: PositionedText[][] = [];
  let rowY = Number.NEGATIVE_INFINITY;
  for (const item of sorted) {
    const current = rows[rows.length - 1];
    if (current && Math.abs(item.y - rowY) <= LINE_TOLERANCE) {
      current.push(item);
    } else {
      rows.push([item]);
      rowY = item.y;
    }
  }
  return rows;
}

/** Joins one row's items left to right, inserting a space where there is a visible gap. */
export function joinRow(row: PositionedText[]): string {
  const items = [...row].sort((a, b) => a.x - b.x);
  let text = '';
  let prevEnd = Number.NEGATIVE_INFINITY;
  for (const item of items) {
    if (text) {
      const gap = item.x - prevEnd;
      const threshold = Math.max(1, item.height * 0.15);
      if (gap > threshold && !/\s$/.test(text) && !/^\s/.test(item.text)) text += ' ';
    }
    text += item.text;
    prevEnd = Math.max(prevEnd, item.x + item.width);
  }
  return text.replace(/\s+/g, ' ').trim();
}

const crosses = (i: PositionedText, gutter: number): boolean => i.x < gutter && i.x + i.width > gutter;

/**
 * Finds the x of a vertical gutter separating two text columns, or null for a single-column page.
 * A gutter is a vertical band near the middle of the page that at most a few rows cross (spanning lines such
 * as a name banner), with substantial, independent text on both sides: the columns run side by side for at
 * least 40% of the body rows, and neither side is just row-aligned fragments such as right-aligned dates.
 */
export function findGutter(items: PositionedText[], pageWidth: number): number | null {
  if (items.length < MIN_COLUMN_ROWS * 2) return null;
  const minX = Math.floor(Math.min(...items.map((i) => i.x)));
  const maxX = Math.ceil(Math.max(...items.map((i) => i.x + i.width)));
  const span = maxX - minX;
  if (span <= MIN_GUTTER) return null;

  // Number of rows covering each 1pt bin.
  const rows = groupRows(items);
  const counts = new Uint16Array(span + 1);
  const mark = new Uint8Array(span + 1);
  for (const row of rows) {
    mark.fill(0);
    for (const item of row) {
      const from = Math.max(0, Math.floor(item.x + 0.5) - minX);
      const to = Math.min(span, Math.ceil(item.x + item.width - 0.5) - minX);
      for (let i = from; i <= to; i++) mark[i] = 1;
    }
    for (let i = 0; i <= span; i++) counts[i] += mark[i];
  }
  const allowed = Math.floor(rows.length * MAX_SPANNING_SHARE);

  // Widest run of bins crossed by at most `allowed` rows whose centre lies in the middle 20-80% of the page.
  let best: { start: number; width: number } | null = null;
  let runStart = -1;
  for (let i = 0; i <= span + 1; i++) {
    const free = i <= span && counts[i] <= allowed;
    if (free && runStart < 0) runStart = i;
    if (!free && runStart >= 0) {
      const width = i - runStart;
      const centre = minX + runStart + width / 2;
      if (
        width >= MIN_GUTTER &&
        centre >= pageWidth * 0.2 &&
        centre <= pageWidth * 0.8 &&
        (!best || width > best.width)
      ) {
        best = { start: runStart, width };
      }
      runStart = -1;
    }
  }
  if (!best) return null;
  const gutter = minX + best.start + best.width / 2;

  const columnRows = rows.filter((r) => !r.some((i) => crosses(i, gutter)));
  if (rows.length - columnRows.length > allowed) return null;
  const left = columnRows.map((r) => r.filter((i) => i.x < gutter)).filter((r) => r.length > 0);
  const right = columnRows.map((r) => r.filter((i) => i.x >= gutter)).filter((r) => r.length > 0);
  if (left.length < MIN_COLUMN_ROWS || right.length < MIN_COLUMN_ROWS) return null;

  const leftChars = sumChars(left.flat());
  const rightChars = sumChars(right.flat());
  const total = leftChars + rightChars;
  if (total === 0) return null;
  if (leftChars / total < MIN_SIDE_CHAR_SHARE || rightChars / total < MIN_SIDE_CHAR_SHARE) return null;
  if (isFragmentSide(left, right, leftChars / total) || isFragmentSide(right, left, rightChars / total)) {
    return null;
  }

  const leftYs = left.map((r) => r[0].y);
  const rightYs = right.map((r) => r[0].y);
  const top = Math.max(Math.min(...leftYs), Math.min(...rightYs));
  const bottom = Math.min(Math.max(...leftYs), Math.max(...rightYs));
  if (bottom < top) return null;
  const sideBySide = columnRows.filter(
    (r) => r[0].y >= top - LINE_TOLERANCE && r[0].y <= bottom + LINE_TOLERANCE,
  );
  if (sideBySide.length / rows.length < MIN_OVERLAP_SHARE) return null;
  return gutter;
}

/**
 * True when `side` is not an independent column: its rows almost all sit on rows of `other` and are either
 * mostly short date fragments, or few and light (a margin of labels next to the real text).
 */
function isFragmentSide(side: PositionedText[][], other: PositionedText[][], charShare: number): boolean {
  const otherYs = other.map((r) => r[0].y);
  const aligned = side.filter((r) => otherYs.some((y) => Math.abs(y - r[0].y) <= LINE_TOLERANCE)).length;
  if (aligned / side.length < ALIGNED_SHARE) return false;
  const dateRows = side.filter((r) => {
    const text = joinRow(r);
    return text.length <= MAX_DATE_FRAGMENT_CHARS && DATE_LIKE.test(text);
  }).length;
  if (dateRows / side.length >= DATE_ROW_SHARE) return true;
  return side.length <= other.length * FRAGMENT_ROW_RATIO && charShare < FRAGMENT_CHAR_SHARE;
}

function sumChars(items: PositionedText[]): number {
  return items.reduce((n, i) => n + i.text.replace(/\s/g, '').length, 0);
}

function rowToLine(row: PositionedText[], page: number, region: Region, column: 0 | 1): Line | null {
  const text = joinRow(row);
  if (!text) return null;
  return {
    text,
    page,
    x: Math.min(...row.map((i) => i.x)),
    y: Math.min(...row.map((i) => i.y)),
    column,
    region,
  };
}

function toLines(items: PositionedText[], page: number, region: Region, column: 0 | 1): Line[] {
  return groupRows(items)
    .map((row) => rowToLine(row, page, region, column))
    .filter((l): l is Line => l !== null);
}

/**
 * Body lines of a two-column page. Rows crossing the gutter (spanning lines) split the page into bands; a
 * spanning row is read in column 0 before the band below it, and each band is read left column, then right.
 */
function twoColumnLines(body: PositionedText[], gutter: number, page: number): Line[] {
  const lines: Line[] = [];
  let band: PositionedText[] = [];
  const flush = (): void => {
    lines.push(
      ...toLines(
        band.filter((i) => i.x < gutter),
        page,
        'body',
        0,
      ),
      ...toLines(
        band.filter((i) => i.x >= gutter),
        page,
        'body',
        1,
      ),
    );
    band = [];
  };
  for (const row of groupRows(body)) {
    if (row.some((i) => crosses(i, gutter))) {
      flush();
      const line = rowToLine(row, page, 'body', 0);
      if (line) lines.push(line);
    } else {
      band.push(...row);
    }
  }
  flush();
  return lines;
}

/** Turns one page's positioned text into lines in true reading order. */
export function layoutPage(
  rawItems: PositionedText[],
  pageWidth: number,
  pageHeight: number,
  page: number,
): PageLayout {
  const items = rawItems.filter((i) => i.text.trim() !== '');
  const header = items.filter((i) => regionFor(i.y, pageHeight) === 'header');
  const footer = items.filter((i) => regionFor(i.y, pageHeight) === 'footer');
  const body = items.filter((i) => regionFor(i.y, pageHeight) === 'body');

  const gutter = findGutter(body, pageWidth);
  const bodyLines = gutter === null ? toLines(body, page, 'body', 0) : twoColumnLines(body, gutter, page);

  return {
    lines: [...toLines(header, page, 'header', 0), ...bodyLines, ...toLines(footer, page, 'footer', 0)],
    twoColumn: gutter !== null,
  };
}
