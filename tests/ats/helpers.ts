// Test helpers: build ExtractedDocuments by hand (src/extract is owned by another unit).
import type { ExtractedDocument, FileKind, Line, SimulationResult } from '../../src/types.ts';

/** One body line per text line, the way docx/txt/paste extraction produces them. */
export function textToLines(text: string): Line[] {
  return text.split(/\r?\n/).map((t, i) => ({
    text: t,
    page: 1,
    x: 0,
    y: i,
    column: 0,
    region: 'body',
  }));
}

export function docFromLines(
  lines: Line[],
  opts: Partial<Omit<ExtractedDocument, 'lines'>> & { columns?: 1 | 2 } = {},
): ExtractedDocument {
  const { columns, ...rest } = opts;
  return {
    kind: 'paste',
    fileName: 'test.txt',
    pages: Math.max(1, ...lines.map((l) => l.page)),
    ...rest,
    lines,
    layout: {
      columns: columns ?? 1,
      hasTables: lines.some((l) => l.inTable),
      hasTextBoxes: lines.some((l) => l.inTextBox),
      headerText: lines.filter((l) => l.region === 'header').map((l) => l.text).join('\n'),
      footerText: lines.filter((l) => l.region === 'footer').map((l) => l.text).join('\n'),
      imageOnly: false,
      ...rest.layout,
    },
  };
}

export function docFromText(text: string, kind: FileKind = 'paste'): ExtractedDocument {
  return docFromLines(textToLines(text), { kind, fileName: kind === 'paste' ? 'pasted.txt' : `resume.${kind}` });
}

/**
 * A two-column PDF-like resume. Reading order (as u2 delivers it) is the left column fully, then the
 * right column; y values interleave so a parser that sorts by (y, x) mixes the columns.
 */
export function twoColumnDoc(): ExtractedDocument {
  const left = [
    'Jordan Rivera',
    'Austin, TX',
    'jordan.rivera@example.com',
    '(555) 010-2345',
    'Skills',
    'JavaScript, TypeScript, React',
    'Node.js, AWS, SQL',
    'Education',
    'B.S. Computer Science',
    'University of Texas at Austin, 2016',
  ];
  const right = [
    'Summary',
    'Frontend engineer building accessible web apps.',
    'Experience',
    'Senior Software Engineer - Lonestar Analytics',
    '03/2021 - Present',
    'Built CI/CD pipelines with GitHub Actions.',
    'Software Engineer - Bluebonnet Health',
    '06/2018 - 02/2021',
    'Developed React features and a Node.js API.',
  ];
  // Left lines sit at y = 20 + 20*i, right lines at y = 30 + 20*i. A (y, x) sort puts 'Summary' (y 30)
  // above the location, and the left 'Skills' (y 100) / 'Education' (y 160) headings between each job
  // title and its dates, so a column-blind parser loses the location and every dated job.
  const lines: Line[] = [
    ...left.map<Line>((text, i) => ({ text, page: 1, x: 40, y: 20 + 20 * i, column: 0, region: 'body' })),
    ...right.map<Line>((text, i) => ({ text, page: 1, x: 320, y: 30 + 20 * i, column: 1, region: 'body' })),
  ];
  return docFromLines(lines, { kind: 'pdf', fileName: 'two-column.pdf', columns: 2 });
}

/** A resume whose only email/phone sits in the page header. */
export function headerContactDoc(): ExtractedDocument {
  const body = textToLines(
    [
      'Jordan Rivera',
      'Austin, TX',
      'Experience',
      'Software Engineer - Bluebonnet Health',
      '06/2018 - 02/2021',
      'Education',
      'B.S. Computer Science, University of Texas at Austin, 2016',
      'Skills',
      'JavaScript, TypeScript',
    ].join('\n'),
  ).map((l) => ({ ...l, y: l.y + 1 }));
  const header: Line = {
    text: 'jordan.rivera@example.com | (555) 010-2345',
    page: 1,
    x: 0,
    y: 0,
    column: 0,
    region: 'header',
  };
  return docFromLines([header, ...body], { kind: 'docx', fileName: 'header.docx' });
}

export function fakeResult(partial: Partial<SimulationResult> & { profileId: string }): SimulationResult {
  return {
    profileName: partial.profileId,
    rawText: '',
    parsed: { contact: { links: [] }, experience: [], education: [], skills: [], sections: [], unparsedDates: [] },
    fieldsFound: 0,
    fieldsTotal: 7,
    jdProvided: true,
    score: null,
    searchMatch: null,
    matched: [],
    missing: [],
    warnings: [],
    ...partial,
  };
}
