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

  it('keeps right-aligned job dates on a page without full-width lines single-column', () => {
    const items: PositionedText[] = [];
    let y = 80;
    for (let job = 0; job < 6; job++) {
      items.push(item(`Job title ${job} - Employer`, 50, y, 150), item('Jan 2019 - Dec 2020', 470, y, 90));
      items.push(item(`- short bullet ${job}a`, 50, y + 14, 120), item(`- short bullet ${job}b`, 50, y + 28, 120));
      y += 50;
    }
    expect(findGutter(items, 612)).toBeNull();
    const { lines, twoColumn } = layoutPage(items, 612, 792, 1);
    expect(twoColumn).toBe(false);
    expect(lines).toHaveLength(18);
    expect(lines[0].text).toBe('Job title 0 - Employer Jan 2019 - Dec 2020');
    expect(lines.every((l) => l.column === 0)).toBe(true);
  });

  it('tolerates a full-width banner above two real columns and reads it first', () => {
    const items: PositionedText[] = [item('CASEY MORGAN - BACKEND SOFTWARE ENGINEER', 50, 70, 520)];
    for (let i = 0; i < 20; i++) {
      items.push(item(`left ${i}`, 40, 100 + i * 15, 100), item(`right column text ${i}`, 260, 100 + i * 15, 280));
    }
    const { lines, twoColumn } = layoutPage(items, 612, 792, 1);
    expect(twoColumn).toBe(true);
    expect(lines[0]).toMatchObject({ text: 'CASEY MORGAN - BACKEND SOFTWARE ENGINEER', column: 0 });
    expect(lines.slice(1, 21).every((l) => l.column === 0 && l.text.startsWith('left'))).toBe(true);
    expect(lines.slice(21).every((l) => l.column === 1 && l.text.startsWith('right'))).toBe(true);
    expect(lines).toHaveLength(41);
  });

  it('reads a spanning line between two column bands in place', () => {
    const items: PositionedText[] = [];
    for (let i = 0; i < 8; i++) {
      items.push(item(`top left ${i}`, 40, 100 + i * 15, 100), item(`top right text ${i}`, 260, 100 + i * 15, 280));
    }
    items.push(item('A full width divider sentence across the whole page', 40, 230, 520));
    for (let i = 0; i < 8; i++) {
      items.push(item(`bottom left ${i}`, 40, 250 + i * 15, 100), item(`bottom right ${i}`, 260, 250 + i * 15, 280));
    }
    const { lines, twoColumn } = layoutPage(items, 612, 792, 1);
    expect(twoColumn).toBe(true);
    const texts = lines.map((l) => l.text);
    expect(texts.indexOf('top right text 7')).toBeLessThan(texts.indexOf('A full width divider sentence across the whole page'));
    expect(texts.indexOf('A full width divider sentence across the whole page')).toBeLessThan(texts.indexOf('bottom left 0'));
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

  it('keeps a name near the top margin in the body when body lines follow without a gap', () => {
    // 0.5in top margin, 20pt name: baseline ~54pt on a 792pt page (inside the top 7% band).
    const items: PositionedText[] = [item('Casey Morgan', 50, 54, 160)];
    items.push(item('casey.morgan@example.com | (555) 010-7788', 50, 70, 260));
    for (let i = 0; i < 20; i++) items.push(item(`Body line ${i}`, 50, 86 + i * 14, 200));
    const { lines } = layoutPage(items, 612, 792, 1);
    expect(lines[0]).toMatchObject({ text: 'Casey Morgan', region: 'body' });
    expect(lines[1]).toMatchObject({ region: 'body' });
    expect(lines.every((l) => l.region === 'body')).toBe(true);
  });

  it('treats a top-band line separated from the body by a clear gap as a header, and mirrors it for footers', () => {
    const items: PositionedText[] = [item('casey.morgan@example.com', 50, 50, 160)];
    for (let i = 0; i < 20; i++) items.push(item(`Body line ${i}`, 50, 90 + i * 14, 200));
    items.push(item('Page 1 of 1', 50, 750, 60)); // inside the bottom 7% band, 6% from the bottom edge
    const { lines } = layoutPage(items, 612, 792, 1);
    expect(lines[0]).toMatchObject({ text: 'casey.morgan@example.com', region: 'header' });
    expect(lines[lines.length - 1]).toMatchObject({ text: 'Page 1 of 1', region: 'footer' });

    // The same footer line directly under the last body line is body text.
    const tight = [...items.slice(0, -1), item('Last body line', 50, 730, 60), item('Page 1 of 1', 50, 744, 60)];
    expect(layoutPage(tight, 612, 792, 1).lines.every((l) => l.region !== 'footer')).toBe(true);
  });

  it('always treats lines above 4% of the page as header, gap or not', () => {
    const items: PositionedText[] = [item('Casey Morgan', 50, 20, 160)];
    for (let i = 0; i < 20; i++) items.push(item(`Body line ${i}`, 50, 34 + i * 14, 200));
    expect(layoutPage(items, 612, 792, 1).lines[0]).toMatchObject({ text: 'Casey Morgan', region: 'header' });
  });

  it('ignores an item far off the page when looking for a gutter (and returns quickly)', () => {
    const items: PositionedText[] = [];
    for (let i = 0; i < 10; i++) {
      items.push(item(`left ${i}`, 40, 100 + i * 15, 100), item(`right column text ${i}`, 260, 100 + i * 15, 280));
    }
    const expected = findGutter(items, 612);
    const started = performance.now();
    const withOffPage = findGutter([...items, item('off page', 1e6, 150, 40)], 612);
    expect(performance.now() - started).toBeLessThan(500);
    expect(withOffPage).toBe(expected);
    expect(findGutter([...items, item('negative', -1e6, 150, 40)], 612)).toBe(expected);
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
