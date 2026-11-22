// DOCX extraction: mammoth for the body (paragraphs, lists, tables), plus a small ZIP read of the raw parts for
// what mammoth drops (page headers/footers) or flattens (text boxes).
import type { ExtractedDocument, Line, Region } from '../types.ts';
import { emptyLayout } from './text.ts';
import { canInflate, readZipTexts } from './zip.ts';

interface DraftLine {
  text: string;
  region: Region;
  inTable?: boolean;
  inTextBox?: boolean;
}

const norm = (s: string): string => s.replace(/\s+/g, ' ').trim();

/** Throws when mammoth cannot read the file; the caller maps that to ExtractError('corrupt'). */
export async function extractDocx(bytes: Uint8Array, fileName: string): Promise<ExtractedDocument> {
  const { default: mammoth } = await import('mammoth');
  const arrayBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  // Mammoth's browser build reads `arrayBuffer`; its Node build (used by Vitest) reads `buffer`, which
  // accepts a Uint8Array. Passing both works in either environment.
  const input = { arrayBuffer, buffer: bytes } as unknown as { arrayBuffer: ArrayBuffer };

  const body: DraftLine[] = [];
  let hasTables = false;
  if (typeof DOMParser !== 'undefined') {
    const { value: html } = await mammoth.convertToHtml(input);
    const dom = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
    hasTables = walk(dom.body, body);
  } else {
    // No DOM (plain Node): fall back to mammoth's raw text, one line per paragraph.
    const { value } = await mammoth.extractRawText(input);
    for (const t of value.split(/\n+/)) if (norm(t)) body.push({ text: norm(t), region: 'body' });
  }

  const parts = await readParts(bytes);
  const header = parts.header.map((text): DraftLine => ({ text, region: 'header' }));
  const footer = parts.footer.map((text): DraftLine => ({ text, region: 'footer' }));

  // Mammoth usually inlines text-box paragraphs into the body; flag those, append any it missed.
  for (const text of parts.textBoxes) {
    const existing = body.find((l) => l.text === text && !l.inTextBox);
    if (existing) existing.inTextBox = true;
    else body.push({ text, region: 'body', inTextBox: true });
  }

  const lines: Line[] = [...header, ...body, ...footer].map((d, i) => ({
    text: d.text,
    page: 1,
    x: 0,
    y: i,
    column: 0,
    region: d.region,
    ...(d.inTable ? { inTable: true } : {}),
    ...(d.inTextBox ? { inTextBox: true } : {}),
  }));

  const layout = emptyLayout();
  layout.hasTables = hasTables;
  layout.hasTextBoxes = parts.hasTextBoxes;
  layout.headerText = parts.header.join('\n');
  layout.footerText = parts.footer.join('\n');
  return { kind: 'docx', fileName, lines, pages: 1, layout };
}

/** Collects lines from mammoth's HTML in document order. Returns true when a table was seen. */
function walk(root: Element, out: DraftLine[]): boolean {
  let sawTable = false;
  for (const el of Array.from(root.children)) {
    const tag = el.tagName.toLowerCase();
    if (tag === 'table') {
      sawTable = true;
      for (const tr of Array.from(el.querySelectorAll('tr'))) {
        if (tr.closest('table') !== el) continue; // nested tables are handled as their own cells' text
        const cells = Array.from(tr.children)
          .filter((c) => /^t[dh]$/i.test(c.tagName))
          .map((c) => norm(c.textContent ?? ''))
          .filter(Boolean);
        if (cells.length) out.push({ text: cells.join(' | '), region: 'body', inTable: true });
      }
    } else if (/^(p|h[1-6])$/.test(tag)) {
      const text = norm(el.textContent ?? '');
      if (text) out.push({ text, region: 'body' });
    } else if (tag === 'li') {
      const own = el.cloneNode(true) as Element;
      for (const nested of Array.from(own.querySelectorAll('ul, ol, table'))) nested.remove();
      const text = norm(own.textContent ?? '');
      if (text) out.push({ text, region: 'body' });
      for (const nested of Array.from(el.children)) {
        if (/^(ul|ol|table)$/i.test(nested.tagName)) {
          const wrapper = el.ownerDocument.createElement('div');
          wrapper.appendChild(nested.cloneNode(true));
          sawTable = walk(wrapper, out) || sawTable;
        }
      }
    } else {
      sawTable = walk(el, out) || sawTable;
    }
  }
  return sawTable;
}

interface RawParts {
  header: string[];
  footer: string[];
  textBoxes: string[];
  hasTextBoxes: boolean;
}

/** Reads header/footer parts and text boxes straight from the ZIP. Best effort: failures yield nothing. */
async function readParts(bytes: Uint8Array): Promise<RawParts> {
  const empty: RawParts = { header: [], footer: [], textBoxes: [], hasTextBoxes: false };
  if (!canInflate()) return empty;
  let texts: Map<string, string>;
  try {
    texts = await readZipTexts(bytes, (n) => /^word\/(header\d*|footer\d*|document)\.xml$/i.test(n));
  } catch {
    return empty;
  }
  const byPrefix = (prefix: string): string[] =>
    unique(
      [...texts.entries()]
        .filter(([name]) => name.toLowerCase().startsWith(`word/${prefix}`))
        .sort(([a], [b]) => a.localeCompare(b, 'en', { numeric: true }))
        .flatMap(([, xml]) => paragraphs(xml)),
    );

  const doc = texts.get('word/document.xml') ?? '';
  const boxes = [...doc.matchAll(/<w:txbxContent\b[^>]*>([\s\S]*?)<\/w:txbxContent>/g)];
  return {
    header: byPrefix('header'),
    footer: byPrefix('footer'),
    // Word stores each text box twice (DrawingML + VML fallback), so de-duplicate.
    textBoxes: unique(boxes.flatMap((m) => paragraphs(m[1]))),
    hasTextBoxes: boxes.length > 0,
  };
}

/** Text of each non-empty <w:p> in a WordprocessingML fragment. */
export function paragraphs(xml: string): string[] {
  const out: string[] = [];
  for (const m of xml.matchAll(/<w:p(?:\s[^>]*?)?(?<!\/)>([\s\S]*?)<\/w:p>/g)) {
    let text = '';
    for (const run of m[1].matchAll(/<w:t(?:\s[^>]*?)?(?<!\/)>([^<]*)<\/w:t>|<w:(tab|br|cr)\b[^>]*\/>/g)) {
      text += run[2] ? ' ' : decodeXml(run[1] ?? '');
    }
    const t = norm(text);
    if (t) out.push(t);
  }
  return out;
}

function decodeXml(s: string): string {
  return s.replace(/&(lt|gt|amp|quot|apos|#\d+|#x[0-9a-f]+);/gi, (all, e: string) => {
    const named: Record<string, string> = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" };
    const lower = e.toLowerCase();
    if (lower in named) return named[lower];
    const code = lower.startsWith('#x') ? parseInt(lower.slice(2), 16) : parseInt(lower.slice(1), 10);
    return Number.isFinite(code) ? String.fromCodePoint(code) : all;
  });
}

function unique(items: string[]): string[] {
  return [...new Set(items)];
}
