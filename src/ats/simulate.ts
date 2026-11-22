// Runs one ATS profile over an extracted document: parser view -> parse -> fields -> keywords -> score.
import type {
  AtsProfile,
  ExtractedDocument,
  Line,
  ParsedResume,
  Report,
  SimulationResult,
  Warning,
} from '../types.ts';
import { parseResume } from '../parse/index.ts';
import { extractKeywords, matchKeywords } from './keywords.ts';
import { PROFILES } from './profiles/index.ts';

export const FIELDS_TOTAL = 7;

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;
const PHONE_RE = /(?:\+?\d[\d\s().-]{8,}\d)/;

function hasContact(text: string): boolean {
  if (EMAIL_RE.test(text)) return true;
  const m = text.match(PHONE_RE);
  return !!m && m[0].replace(/\D/g, '').length >= 10;
}

interface ParserView {
  rawText: string;
  warnings: Warning[];
}

/** What text this ATS's parser actually gets, after its layout rules. */
export function parserView(doc: ExtractedDocument, profile: AtsProfile): ParserView {
  const warnings: Warning[] = [];
  const p = profile.parser;
  let lines: Line[] = [...doc.lines];

  if (!p.readsHeaderFooter) {
    const dropped = lines.filter((l) => l.region !== 'body');
    if (dropped.length > 0) {
      lines = lines.filter((l) => l.region === 'body');
      if (dropped.some((l) => hasContact(l.text))) {
        warnings.push({
          severity: 'error',
          code: 'header-contact',
          message: `${profile.name} does not read page headers or footers, so the contact details placed there are lost. Move your email and phone into the main body.`,
        });
      } else {
        warnings.push({
          severity: 'info',
          code: 'header',
          message: `${profile.name} ignores page headers and footers; their text is not read.`,
        });
      }
    }
  }

  if (!p.handlesColumns && doc.layout.columns === 2) {
    lines = [...lines].sort((a, b) => a.page - b.page || a.y - b.y || a.x - b.x);
    warnings.push({
      severity: 'warning',
      code: 'two-column',
      message: `${profile.name} reads two-column layouts line by line across both columns, mixing them together. Use a single column.`,
    });
  }

  if (!p.handlesTables && lines.some((l) => l.inTable)) {
    lines = lines.filter((l) => !l.inTable);
    warnings.push({
      severity: 'warning',
      code: 'table',
      message: `${profile.name} skips text inside tables. Move that content into normal paragraphs.`,
    });
  }

  if (!p.readsTextBoxes && lines.some((l) => l.inTextBox)) {
    lines = lines.filter((l) => !l.inTextBox);
    warnings.push({
      severity: 'warning',
      code: 'text-box',
      message: `${profile.name} does not read text boxes or shapes. Move that content into the main text.`,
    });
  }

  if (doc.kind !== 'paste' && !p.preferredFormats.includes(doc.kind)) {
    warnings.push({
      severity: 'info',
      code: 'format',
      message: `${profile.name} works best with ${p.preferredFormats.map((f) => `.${f}`).join(' or ')} files; .${doc.kind} may parse less reliably.`,
    });
  }

  return { rawText: lines.map((l) => l.text).join('\n'), warnings };
}

export function countFields(parsed: ParsedResume): number {
  const c = parsed.contact;
  return [
    !!c.name,
    !!c.email,
    !!c.phone,
    !!c.location,
    parsed.experience.some((j) => !!j.start || !!j.end),
    parsed.education.length > 0,
    parsed.skills.length > 0,
  ].filter(Boolean).length;
}

function emptyParsed(): ParsedResume {
  return { contact: { links: [] }, experience: [], education: [], skills: [], sections: [], unparsedDates: [] };
}

export function simulate(
  doc: ExtractedDocument,
  jd: string | undefined,
  profile: AtsProfile,
): SimulationResult {
  const jdProvided = !!jd?.trim();
  const keywords = jdProvided ? extractKeywords(jd ?? '') : [];
  const view = parserView(doc, profile);
  const base = {
    profileId: profile.id,
    profileName: profile.name,
    fieldsTotal: FIELDS_TOTAL,
    jdProvided,
  };

  if (doc.layout.imageOnly || !view.rawText.trim()) {
    const isSearch = profile.scoring === 'search-match';
    return {
      ...base,
      rawText: '',
      parsed: emptyParsed(),
      fieldsFound: 0,
      score: jdProvided && !isSearch ? 0 : null,
      searchMatch: jdProvided && isSearch ? 0 : null,
      matched: [],
      missing: keywords,
      warnings: [
        {
          severity: 'error',
          code: 'no-text',
          message: 'No text extracted - this ATS would see an empty resume.',
        },
      ],
    };
  }

  const parsed = parseResume(view.rawText, { headings: profile.headings, dateFormats: profile.dateFormats });
  const warnings = [...view.warnings];
  for (const s of parsed.sections) {
    if (!s.recognized) {
      warnings.push({
        severity: 'warning',
        code: 'unknown-heading',
        message: `${profile.name} does not recognise the heading "${s.heading}"; the content under it may be ignored. Use a standard heading.`,
      });
    }
  }
  for (const d of parsed.unparsedDates) {
    warnings.push({
      severity: 'warning',
      code: 'date-format',
      message: `${profile.name} cannot read the date "${d}". Use one of: ${profile.dateFormats.join(', ')}.`,
    });
  }

  const fieldsFound = countFields(parsed);
  let score: number | null = null;
  let searchMatch: number | null = null;
  let matched: string[] = [];
  let missing: string[] = [];

  if (jdProvided) {
    ({ matched, missing } = matchKeywords(keywords, view.rawText, profile.keywordMode));
    const matchRatio = keywords.length ? matched.length / keywords.length : 0;
    if (profile.scoring === 'score') {
      const errors = warnings.filter((w) => w.severity === 'error').length;
      const warns = warnings.filter((w) => w.severity === 'warning').length;
      const penalty = Math.min(1, 0.25 * errors + 0.1 * warns);
      const w = profile.weights;
      score = Math.round(
        100 * (w.keywords * matchRatio + w.completeness * (fieldsFound / FIELDS_TOTAL) + w.formatting * (1 - penalty)),
      );
    } else {
      searchMatch = Math.round(100 * matchRatio);
    }
  }

  return {
    ...base,
    rawText: view.rawText,
    parsed,
    fieldsFound,
    score,
    searchMatch,
    matched,
    missing,
    warnings,
  };
}

export function simulateAll(doc: ExtractedDocument, jd?: string): SimulationResult[] {
  return PROFILES.map((p) => simulate(doc, jd, p));
}

function errorCount(r: SimulationResult): number {
  return r.warnings.filter((w) => w.severity === 'error').length;
}

/** Best outcome first: (score ?? searchMatch ?? -1) desc, then fieldsFound desc, then fewer errors. Stable. */
export function rankResults(results: SimulationResult[]): SimulationResult[] {
  const key = (r: SimulationResult) => r.score ?? r.searchMatch ?? -1;
  return [...results].sort(
    (a, b) => key(b) - key(a) || b.fieldsFound - a.fieldsFound || errorCount(a) - errorCount(b),
  );
}

export function buildReport(fileName: string, results: SimulationResult[]): Report {
  return {
    generatedAt: new Date().toISOString(),
    fileName,
    results: results.map((r) => ({
      profileId: r.profileId,
      profileName: r.profileName,
      score: r.score,
      searchMatch: r.searchMatch,
      matched: r.matched,
      missing: r.missing,
      warnings: r.warnings,
      fields: r.parsed,
    })),
  };
}
