// Schema check for ATS profiles: adding a new ATS must not need anything but a valid profile file.
import type { DateFormatId, FileKind, KeywordMode, SectionKind } from '../types.ts';
import { ALL_DATE_FORMATS } from '../parse/dates.ts';

const FILE_KINDS: FileKind[] = ['pdf', 'docx', 'txt', 'paste'];
const KEYWORD_MODES: KeywordMode[] = ['exact', 'stemmed', 'synonym'];
const SECTION_KINDS: SectionKind[] = [
  'summary',
  'experience',
  'education',
  'skills',
  'projects',
  'certifications',
  'contact',
  'other',
];
const PARSER_FLAGS = ['readsHeaderFooter', 'handlesColumns', 'handlesTables', 'readsTextBoxes'] as const;
const WEIGHT_KEYS = ['keywords', 'completeness', 'formatting'] as const;

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function nonEmptyString(o: Record<string, unknown>, key: string, errors: string[]): void {
  const v = o[key];
  if (typeof v !== 'string') errors.push(`${key} must be a string`);
  else if (!v.trim()) errors.push(`${key} must not be empty`);
}

/** [] = valid; otherwise one message per problem. */
export function validateProfile(p: unknown): string[] {
  const errors: string[] = [];
  if (!isObject(p)) return ['profile must be an object'];

  nonEmptyString(p, 'id', errors);
  if (typeof p.id === 'string' && p.id && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(p.id)) {
    errors.push(`id "${p.id}" must be kebab-case`);
  }
  for (const key of ['name', 'vendor', 'note', 'basis']) nonEmptyString(p, key, errors);

  const parser = p.parser;
  if (!isObject(parser)) {
    errors.push('parser must be an object');
  } else {
    for (const flag of PARSER_FLAGS) {
      if (typeof parser[flag] !== 'boolean') errors.push(`parser.${flag} must be a boolean`);
    }
    const formats = parser.preferredFormats;
    if (!Array.isArray(formats) || formats.length === 0) {
      errors.push('parser.preferredFormats must be a non-empty array');
    } else {
      for (const f of formats) {
        if (!FILE_KINDS.includes(f as FileKind)) errors.push(`parser.preferredFormats: unknown format "${String(f)}"`);
      }
    }
  }

  const headings = p.headings;
  if (!isObject(headings)) {
    errors.push('headings must be an object');
  } else {
    for (const [kind, list] of Object.entries(headings)) {
      if (!SECTION_KINDS.includes(kind as SectionKind)) errors.push(`headings: unknown section "${kind}"`);
      if (!Array.isArray(list) || list.some((h) => typeof h !== 'string' || h !== h.toLowerCase() || !h.trim())) {
        errors.push(`headings.${kind} must be an array of non-empty lower-case strings`);
      }
    }
    for (const required of ['experience', 'education', 'skills'] as const) {
      const list = headings[required];
      if (!Array.isArray(list) || list.length === 0) errors.push(`headings.${required} must not be empty`);
    }
  }

  const dates = p.dateFormats;
  if (!Array.isArray(dates) || dates.length === 0) {
    errors.push('dateFormats must be a non-empty array');
  } else {
    for (const d of dates) {
      if (!ALL_DATE_FORMATS.includes(d as DateFormatId)) errors.push(`dateFormats: unknown format "${String(d)}"`);
    }
  }

  if (!KEYWORD_MODES.includes(p.keywordMode as KeywordMode)) {
    errors.push(`keywordMode must be one of ${KEYWORD_MODES.join(', ')}`);
  }
  if (p.scoring !== 'score' && p.scoring !== 'search-match') {
    errors.push("scoring must be 'score' or 'search-match'");
  }

  const weights = p.weights;
  if (!isObject(weights)) {
    errors.push('weights must be an object');
  } else {
    let sum = 0;
    let allNumbers = true;
    for (const key of WEIGHT_KEYS) {
      const w = weights[key];
      if (typeof w !== 'number' || !Number.isFinite(w)) {
        errors.push(`weights.${key} must be a number`);
        allNumbers = false;
      } else {
        if (w < 0 || w > 1) errors.push(`weights.${key} must be between 0 and 1`);
        sum += w;
      }
    }
    if (allNumbers && Math.abs(sum - 1) > 0.001) {
      errors.push(`weights must sum to 1 (got ${Number(sum.toFixed(4))})`);
    }
  }
  return errors;
}
