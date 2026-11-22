import { describe, expect, it } from 'vitest';
import { paragraphs } from '../../src/extract/docx.ts';
import { findGutter, joinRow, layoutPage, regionFor, type PositionedText } from '../../src/extract/layout.ts';

const item = (text: string, x: number, y: number, width = text.length * 5): PositionedText => ({
  text,
  x,
  y,
  width,
  height: 10,
});

describe('pdf layout helpers', () => {
  it('assigns header / body / footer by the 7% bands', () => {
    expect(regionFor(30, 792)).toBe('header');
    expect(regionFor(400, 792)).toBe('body');
    expect(regionFor(780, 792)).toBe('footer');
  });

  it('joins items with a space only where there is a gap', () => {
    expect(joinRow([item('World', 80, 100), item('Hello', 50, 100, 25)])).toBe('Hello World');
    expect(joinRow([item('Hel', 50, 100, 15), item('lo', 65, 100, 10)])).toBe('Hello');
  });

  it('groups items within 2pt into one line', () => {
    const { lines } = layoutPage([item('A', 50, 100), item('B', 70, 101.5), item('C', 50, 120)], 612, 792, 1);
    expect(lines.map((l) => l.text)).toEqual(['A B', 'C']);
  });

  it('does not split a single-column page with right-aligned dates', () => {
    const items: PositionedText[] = [];
    for (let i = 0; i < 10; i++) {
      items.push(item('A long line of body text that spans most of the page width here', 50, 100 + i * 14, 480));
    }
    items.push(item('Engineer', 50, 300), item('2020 - 2023', 480, 300));
    expect(findGutter(items, 612)).toBeNull();
    expect(layoutPage(items, 612, 792, 1).twoColumn).toBe(false);
  });

  it('finds a gutter between two side-by-side columns', () => {
    const items: PositionedText[] = [];
    for (let i = 0; i < 10; i++) {
      items.push(item(`left ${i}`, 40, 100 + i * 15, 100), item(`right column text ${i}`, 260, 100 + i * 15, 280));
    }
    const gutter = findGutter(items, 612);
    expect(gutter).not.toBeNull();
    expect(gutter!).toBeGreaterThan(140);
    expect(gutter!).toBeLessThan(260);
    const { lines, twoColumn } = layoutPage(items, 612, 792, 1);
    expect(twoColumn).toBe(true);
    expect(lines.slice(0, 10).every((l) => l.column === 0 && l.text.startsWith('left'))).toBe(true);
    expect(lines.slice(10).every((l) => l.column === 1 && l.text.startsWith('right'))).toBe(true);
  });
});

describe('docx xml paragraphs', () => {
  it('reads w:t runs, tabs and entities, skipping empty and self-closing paragraphs', () => {
    const xml =
      '<w:txbxContent><w:p w14:paraId="1"><w:r><w:t>Casey</w:t></w:r><w:r><w:tab/><w:t xml:space="preserve">Morgan &amp; Co</w:t></w:r></w:p>' +
      '<w:p/><w:p w14:paraId="2"/><w:p><w:pPr><w:jc w:val="left"/></w:pPr><w:r><w:t>casey.morgan@example.com</w:t></w:r></w:p></w:txbxContent>';
    expect(paragraphs(xml)).toEqual(['Casey Morgan & Co', 'casey.morgan@example.com']);
  });
});
