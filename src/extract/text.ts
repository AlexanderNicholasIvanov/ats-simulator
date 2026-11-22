import type { ExtractedDocument, FileKind, LayoutInfo, Line } from '../types.ts';

export function emptyLayout(): LayoutInfo {
  return {
    columns: 1,
    hasTables: false,
    hasTextBoxes: false,
    headerText: '',
    footerText: '',
    imageOnly: false,
  };
}

/** Plain text (pasted or .txt): one body line per non-empty trimmed line. Never throws. */
export function extractPlainText(
  text: string,
  fileName = 'pasted.txt',
  kind: FileKind = 'paste',
): ExtractedDocument {
  const lines: Line[] = [];
  for (const raw of (text ?? '').split(/\r\n|\r|\n/)) {
    const t = raw.trim();
    if (!t) continue;
    lines.push({ text: t, page: 1, x: 0, y: lines.length, column: 0, region: 'body' });
  }
  return { kind, fileName, lines, pages: 1, layout: emptyLayout() };
}
