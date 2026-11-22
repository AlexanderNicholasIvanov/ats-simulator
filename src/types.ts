// src/types.ts — the shared contract. Written by u1 verbatim; read-only for every other unit.
export type FileKind = 'pdf' | 'docx' | 'txt' | 'paste';

export type Region = 'header' | 'body' | 'footer';

/** One visual line of the document, in page order. For docx/txt/paste: x=0, column=0, region='body'. */
export interface Line {
  text: string;
  page: number; // 1-based
  x: number; // left edge in PDF points (0 for non-PDF)
  y: number; // distance from top of page in points (or line index for non-PDF)
  column: 0 | 1; // 0 = left / single column, 1 = right column
  region: Region;
  /** true when the line came from a table row (docx tables) or a tab-aligned grid (pdf) */
  inTable?: boolean;
  /** true when the line came from a docx text box / shape */
  inTextBox?: boolean;
}

export interface LayoutInfo {
  columns: 1 | 2;
  hasTables: boolean;
  hasTextBoxes: boolean;
  /** text found in page headers (top 7% of page in PDF; docx header parts) */
  headerText: string;
  footerText: string;
  /** PDF with pages but no extractable text */
  imageOnly: boolean;
}

export interface ExtractedDocument {
  kind: FileKind;
  fileName: string;
  /** Lines in true reading order (left column fully, then right column). */
  lines: Line[];
  pages: number;
  layout: LayoutInfo;
}

export class ExtractError extends Error {
  constructor(
    public code: 'unsupported-type' | 'too-large' | 'empty' | 'corrupt',
    message: string,
  ) {
    super(message);
    this.name = 'ExtractError';
  }
}

export type SectionKind =
  | 'summary'
  | 'experience'
  | 'education'
  | 'skills'
  | 'projects'
  | 'certifications'
  | 'contact'
  | 'other';

export interface Contact {
  name?: string;
  email?: string;
  phone?: string;
  location?: string;
  links: string[];
}

export interface Job {
  title?: string;
  employer?: string;
  /** normalised 'YYYY-MM' or 'YYYY' */
  start?: string;
  /** normalised 'YYYY-MM' | 'YYYY' | 'present' */
  end?: string;
  rawDates?: string;
}

export interface Education {
  institution?: string;
  degree?: string;
  year?: string;
}

export interface SectionHit {
  heading: string;
  recognized: boolean;
  canonical?: SectionKind;
}

export interface ParsedResume {
  contact: Contact;
  experience: Job[];
  education: Education[];
  skills: string[];
  sections: SectionHit[];
  /** date strings found in experience that this parser's date formats could not read */
  unparsedDates: string[];
}

export type DateFormatId =
  | 'MM/YYYY' // 03/2021
  | 'Mon YYYY' // Mar 2021
  | 'Month YYYY' // March 2021
  | 'YYYY' // 2021
  | 'MM-YYYY' // 03-2021
  | 'YYYY-MM' // 2021-03
  | 'Season YYYY'; // Summer 2021

export type KeywordMode = 'exact' | 'stemmed' | 'synonym';

export interface AtsProfile {
  id: string; // kebab-case, unique
  name: string; // display name, e.g. 'Workday'
  vendor: string; // e.g. 'Workday, Inc.'
  /** one-paragraph "how this ATS behaves" note shown on the card */
  note: string;
  /** where the behaviour description comes from (public docs, recruiter guides) */
  basis: string;
  parser: {
    readsHeaderFooter: boolean;
    handlesColumns: boolean;
    handlesTables: boolean;
    readsTextBoxes: boolean;
    preferredFormats: FileKind[];
  };
  /** accepted headings per section, lower-case */
  headings: Partial<Record<SectionKind, string[]>>;
  dateFormats: DateFormatId[];
  keywordMode: KeywordMode;
  /** 'score' = ranks applicants 0-100; 'search-match' = no auto score, recruiter keyword search */
  scoring: 'score' | 'search-match';
  /** score weights, sum 1: keywords, parsed-field completeness, formatting penalty */
  weights: { keywords: number; completeness: number; formatting: number };
}

export type Severity = 'error' | 'warning' | 'info';

export interface Warning {
  severity: Severity;
  code: string; // e.g. 'two-column', 'header-contact', 'date-format', 'unknown-heading', 'no-text', 'table', 'text-box', 'format'
  message: string;
}

export interface SimulationResult {
  profileId: string;
  profileName: string;
  /** the text as this ATS's parser sees it (after its parser rules) */
  rawText: string;
  parsed: ParsedResume;
  fieldsFound: number;
  fieldsTotal: number;
  /** true when a non-empty job description was given */
  jdProvided: boolean;
  /** 0-100 when profile.scoring==='score' and jdProvided, else null */
  score: number | null;
  /** 0-100 keyword search match when profile.scoring==='search-match' and jdProvided, else null */
  searchMatch: number | null;
  matched: string[];
  missing: string[];
  warnings: Warning[];
}

export interface Report {
  generatedAt: string; // ISO
  fileName: string;
  results: Array<{
    profileId: string;
    profileName: string;
    score: number | null;
    searchMatch: number | null;
    matched: string[];
    missing: string[];
    warnings: Warning[];
    fields: ParsedResume;
  }>;
}

// ---- Module entry points (u1 writes stubs that throw 'not implemented'; owners replace them) ----
// src/extract/index.ts (owner u2):
//   export const MAX_BYTES = 5 * 1024 * 1024;
//   export function extractFile(file: File): Promise<ExtractedDocument>   // rejects with ExtractError
//   export function extractPlainText(text: string, fileName?: string, kind?: FileKind): ExtractedDocument
// src/ats/index.ts (owner u3):
//   export const PROFILES: AtsProfile[]                        // 8 default profiles, registry order
//   export function validateProfile(p: unknown): string[]      // [] = valid; else error messages
//   export function simulate(doc: ExtractedDocument, jd: string | undefined, profile: AtsProfile): SimulationResult
//   export function simulateAll(doc: ExtractedDocument, jd?: string): SimulationResult[]
//   export function rankResults(results: SimulationResult[]): SimulationResult[]  // best outcome first
//   export function buildReport(fileName: string, results: SimulationResult[]): Report
// src/sample/index.ts (owner u1, real content):
//   export const SAMPLE_RESUME_TEXT: string; export const SAMPLE_JD: string;
