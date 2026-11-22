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
import { hasContactData, parseResume } from '../parse/index.ts';
import { extractKeywords, matchKeywords } from './keywords.ts';
import { PROFILES } from './profiles/index.ts';

export const FIELDS_TOTAL = 7;

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
      if (dropped.some((l) => hasContactData(l.text))) {
        warnings.push({
          severity: 'error',
          code: 'header-contact',
          message: `${profile.name} does not read page headers or footers, so the contact details placed there are lost. Move your email, phone and links into the main body.`,
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

const NO_KEYWORDS: Warning = {
  severity: 'info',
  code: 'no-keywords',
  message: 'The job description has no recognisable keywords to score against.',
};

/**
 * Simulates one profile. `jdKeywords` is extractKeywords(jd), precomputed by simulateAll so it runs once for
 * all profiles; when omitted it is computed here. A JD with no recognisable keywords is treated as no JD for
 * scoring (jdProvided false, score / searchMatch null) and adds a 'no-keywords' info warning.
 */
export function simulate(
  doc: ExtractedDocument,
  jd: string | undefined,
  profile: AtsProfile,
  jdKeywords?: string[],
): SimulationResult {
  const jdText = !!jd?.trim();
  const keywords = jdText ? (jdKeywords ?? extractKeywords(jd ?? '')) : [];
  const jdProvided = keywords.length > 0;
  const jdWarnings: Warning[] = jdText && !jdProvided ? [NO_KEYWORDS] : [];
  const view = parserView(doc, profile);
  const base = {
    profileId: profile.id,
    profileName: profile.name,
    fieldsTotal: FIELDS_TOTAL,
    jdProvided,
  };

  if (doc.layout.imageOnly || !view.rawText.trim()) {
    const isSearch = profile.scoring === 'search-match';
    // When the document had text, keep the parser-view warnings that explain why this ATS sees none.
    const docHadText = !doc.layout.imageOnly && doc.lines.some((l) => l.text.trim() !== '');
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
        ...(docHadText ? view.warnings : []),
        ...jdWarnings,
      ],
    };
  }

  const parsed = parseResume(view.rawText, { headings: profile.headings, dateFormats: profile.dateFormats });
  const warnings = [...view.warnings, ...jdWarnings];
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
  const keywords = jd?.trim() ? extractKeywords(jd) : [];
  return PROFILES.map((p) => simulate(doc, jd, p, keywords));
}

function errorCount(r: SimulationResult): number {
  return r.warnings.filter((w) => w.severity === 'error').length;
}

/**
 * One outcome in [0, 1], computed the same way for every result whatever its profile's own scoring:
 * 0.5 * keyword match ratio + 0.3 * field completeness + 0.2 * (1 - formatting penalty) with a JD, and
 * the last two terms renormalised to sum to 1 without one. Penalty = min(1, 0.25 * errors + 0.1 * warnings).
 */
export function outcome(r: SimulationResult): number {
  const errors = errorCount(r);
  const warns = r.warnings.filter((w) => w.severity === 'warning').length;
  const formatting = 1 - Math.min(1, 0.25 * errors + 0.1 * warns);
  const completeness = r.fieldsTotal > 0 ? r.fieldsFound / r.fieldsTotal : 0;
  if (!r.jdProvided) return (0.3 * completeness + 0.2 * formatting) / 0.5;
  const total = r.matched.length + r.missing.length;
  const matchRatio = total > 0 ? r.matched.length / total : 0;
  return 0.5 * matchRatio + 0.3 * completeness + 0.2 * formatting;
}

/** Best outcome first (see outcome); ties: more fieldsFound, then fewer errors, then input order. */
export function rankResults(results: SimulationResult[]): SimulationResult[] {
  return results
    .map((r) => ({ r, key: outcome(r) }))
    .sort(
      (a, b) =>
        b.key - a.key || b.r.fieldsFound - a.r.fieldsFound || errorCount(a.r) - errorCount(b.r),
    )
    .map((x) => x.r);
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
