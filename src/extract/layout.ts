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

const MIN_GUTTER = 12; // pt of empty horizontal space between columns
const MIN_COLUMN_ROWS = 3;
const MIN_OVERLAP_SHARE = 0.4; // share of body rows where both columns run side by side
const MIN_SIDE_CHAR_SHARE = 0.12; // each column must hold at least this share of the body text

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

/**
 * Finds the x of a vertical gutter separating two text columns, or null for a single-column page.
 * A gutter is an empty vertical band (no item covers it) near the middle of the page with substantial text
 * on both sides, where both columns run side by side for at least 40% of the body rows.
 */
export function findGutter(items: PositionedText[], pageWidth: number): number | null {
  if (items.length < MIN_COLUMN_ROWS * 2) return null;
  const minX = Math.floor(Math.min(...items.map((i) => i.x)));
  const maxX = Math.ceil(Math.max(...items.map((i) => i.x + i.width)));
  const span = maxX - minX;
  if (span <= MIN_GUTTER) return null;

  const covered = new Uint8Array(span + 1);
  for (const item of items) {
    const from = Math.max(0, Math.floor(item.x + 0.5) - minX);
    const to = Math.min(span, Math.ceil(item.x + item.width - 0.5) - minX);
    for (let i = from; i <= to; i++) covered[i] = 1;
  }

  // Widest uncovered run whose centre lies in the middle 20-80% of the page.
  let best: { start: number; width: number } | null = null;
  let runStart = -1;
  for (let i = 0; i <= span + 1; i++) {
    const free = i <= span && covered[i] === 0;
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

  const leftChars = sumChars(items.filter((i) => i.x < gutter));
  const rightChars = sumChars(items.filter((i) => i.x >= gutter));
  const total = leftChars + rightChars;
  if (total === 0) return null;
  if (leftChars / total < MIN_SIDE_CHAR_SHARE || rightChars / total < MIN_SIDE_CHAR_SHARE) return null;

  const rows = groupRows(items);
  const leftYs: number[] = [];
  const rightYs: number[] = [];
  for (const row of rows) {
    if (row.some((i) => i.x < gutter)) leftYs.push(row[0].y);
    if (row.some((i) => i.x >= gutter)) rightYs.push(row[0].y);
  }
  if (leftYs.length < MIN_COLUMN_ROWS || rightYs.length < MIN_COLUMN_ROWS) return null;
  const top = Math.max(Math.min(...leftYs), Math.min(...rightYs));
  const bottom = Math.min(Math.max(...leftYs), Math.max(...rightYs));
  if (bottom < top) return null;
  const sideBySide = rows.filter((r) => r[0].y >= top - LINE_TOLERANCE && r[0].y <= bottom + LINE_TOLERANCE);
  if (sideBySide.length / rows.length < MIN_OVERLAP_SHARE) return null;
  return gutter;
}

function sumChars(items: PositionedText[]): number {
  return items.reduce((n, i) => n + i.text.replace(/\s/g, '').length, 0);
}

function toLines(
  items: PositionedText[],
  page: number,
  region: Region,
  column: 0 | 1,
): Line[] {
  const lines: Line[] = [];
  for (const row of groupRows(items)) {
    const text = joinRow(row);
    if (!text) continue;
    lines.push({
      text,
      page,
      x: Math.min(...row.map((i) => i.x)),
      y: Math.min(...row.map((i) => i.y)),
      column,
      region,
    });
  }
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
  const bodyLines =
    gutter === null
      ? toLines(body, page, 'body', 0)
      : [
          ...toLines(
            body.filter((i) => i.x < gutter),
            page,
            'body',
            0,
          ),
          ...toLines(
            body.filter((i) => i.x >= gutter),
            page,
            'body',
            1,
          ),
        ];

  return {
    lines: [...toLines(header, page, 'header', 0), ...bodyLines, ...toLines(footer, page, 'footer', 0)],
    twoColumn: gutter !== null,
  };
}
