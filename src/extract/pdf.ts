// PDF extraction with pdf.js. The worker is bundled locally by Vite (`?url` import) - never loaded from a CDN.
// We use pdf.js's "legacy" build: the default build relies on very new JS built-ins (e.g.
// Uint8Array.prototype.toHex) missing from Node 22/24 and from browsers older than ~2025.
import workerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';
import type { ExtractedDocument, Line } from '../types.ts';
import { layoutPage, type PositionedText } from './layout.ts';
import { emptyLayout } from './text.ts';

type PdfJs = typeof import('pdfjs-dist/legacy/build/pdf.mjs');

let pdfjsPromise: Promise<PdfJs> | null = null;

/** Loads pdf.js lazily (keeps it out of the initial bundle) and configures the local worker once. */
function loadPdfJs(): Promise<PdfJs> {
  pdfjsPromise ??= (async () => {
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    if (typeof Worker === 'undefined') {
      // No Web Worker (Node / jsdom test runs under Vitest): load pdf.js's worker module on the main thread
      // and hand it to pdf.js's "fake worker" via `globalThis.pdfjsWorker`. The URL is the same local `?url`
      // asset, resolved by Vite's module loader. Browsers never take this branch.
      const g = globalThis as { pdfjsWorker?: unknown };
      g.pdfjsWorker ??= await import(/* @vite-ignore */ workerUrl);
    } else {
      pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
    }
    return pdfjs;
  })();
  return pdfjsPromise;
}

/** Subset of pdf.js's TextItem that we use (TextMarkedContent items lack `str`). */
interface RawTextItem {
  str: string;
  transform: number[];
  width: number;
  height: number;
}

function isTextItem(item: unknown): item is RawTextItem {
  return typeof item === 'object' && item !== null && 'str' in item && 'transform' in item;
}

/** Throws on unreadable data; the caller maps that to ExtractError('corrupt'). */
export async function extractPdf(data: Uint8Array, fileName: string): Promise<ExtractedDocument> {
  const pdfjs = await loadPdfJs();
  const task = pdfjs.getDocument({ data });
  const doc = await task.promise;
  try {
    const lines: Line[] = [];
    let twoColumn = false;
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p);
      const [x0, y0, x1, y1] = page.view;
      const width = x1 - x0;
      const height = y1 - y0;
      const content = await page.getTextContent();
      const items: PositionedText[] = [];
      for (const item of content.items) {
        if (!isTextItem(item) || !item.str) continue;
        const [, , , d, tx, ty] = item.transform;
        items.push({
          text: item.str,
          x: tx - x0,
          y: y1 - ty,
          width: item.width,
          height: item.height || Math.abs(d),
        });
      }
      const result = layoutPage(items, width, height, p);
      twoColumn ||= result.twoColumn;
      lines.push(...result.lines);
      page.cleanup();
    }

    const layout = emptyLayout();
    layout.columns = twoColumn ? 2 : 1;
    layout.headerText = joinRegion(lines, 'header');
    layout.footerText = joinRegion(lines, 'footer');
    layout.imageOnly = doc.numPages > 0 && lines.every((l) => l.text.trim() === '');
    return { kind: 'pdf', fileName, lines, pages: doc.numPages, layout };
  } finally {
    await task.destroy();
  }
}

function joinRegion(lines: Line[], region: 'header' | 'footer'): string {
  return lines
    .filter((l) => l.region === region)
    .map((l) => l.text)
    .join('\n');
}
