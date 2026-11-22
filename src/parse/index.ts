// Heuristic resume parser. Deterministic, no network, no ML: it reads plain text the way a
// rule-based ATS parser does, so a profile's heading list and date formats change what it finds.
import type {
  Contact,
  DateFormatId,
  Education,
  Job,
  ParsedResume,
  SectionHit,
  SectionKind,
} from '../types.ts';
import { findDateRanges, findDateTokens, isUnreadable, parseDate } from './dates.ts';

export * from './dates.ts';

export interface ParseOptions {
  headings: Partial<Record<SectionKind, string[]>>;
  dateFormats: DateFormatId[];
}

/** Words that make a short Title Case / ALL CAPS line look like a section heading. */
const HEADING_VOCAB = new Set([
  'about',
  'achievements',
  'activities',
  'affiliations',
  'awards',
  'background',
  'career',
  'certifications',
  'certificates',
  'competencies',
  'contact',
  'courses',
  'coursework',
  'education',
  'employment',
  'experience',
  'expertise',
  'highlights',
  'history',
  'honors',
  'interests',
  'languages',
  'leadership',
  'memberships',
  'objective',
  'profile',
  'projects',
  'publications',
  'qualifications',
  'references',
  'skills',
  'strengths',
  'summary',
  'technologies',
  'training',
  'volunteer',
  'volunteering',
  'hobbies',
  'journey',
  'worked',
]);
const SMALL_WORDS = new Set(['of', 'and', '&', 'the', 'in', 'for', 'to', 'a', 'an', 'with', '/']);

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;
const PHONE_RES = [
  /(?<![\d])(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}(?!\d)/,
  /(?<![\d])\+\d{1,3}(?:[\s.-]?\(?\d{1,4}\)?){2,5}(?!\d)/,
];
const LINK_RE = /\b(?:https?:\/\/\S+|www\.\S+|(?:[a-z]{2,3}\.)?(?:linkedin|github)\.com\/\S+)/gi;
/** A capitalised (any script) word, allowing accents, dots, apostrophes and hyphens: 'Zoë', "O'Neil", 'J.' */
const CAP_WORD = "\\p{Lu}[\\p{L}\\p{M}.'’-]*";
const NAME_RE = new RegExp(`^${CAP_WORD}(?:\\s+${CAP_WORD}){1,3}$`, 'u');
const CITY_SRC = `${CAP_WORD}(?:\\s+(?:${CAP_WORD}|de|do|da|del|la|le|sur|am|upon|on)){0,3}`;
/** 'Austin, TX', 'New York, NY 10001' */
const US_LOCATION_RE = new RegExp(`^(${CITY_SRC}),\\s*([A-Z]{2})(?:\\s+\\d{5}(?:-\\d{4})?)?$`, 'u');
/** 'Berlin, Germany' - the country must be in COUNTRIES */
const COUNTRY_LOCATION_RE = new RegExp(`^(${CITY_SRC}),\\s*(\\p{Lu}[\\p{L}\\p{M} .'’-]*)$`, 'u');
const US_STATES = new Set(
  (
    'AL AK AZ AR CA CO CT DE FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH ' +
    'OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY DC PR ' +
    // Canadian provinces use the same 'City, XX' form
    'AB BC MB NB NL NS NT NU ON PE QC SK YT'
  ).split(' '),
);
const COUNTRIES = new Set(
  (
    'usa|united states|united states of america|us|canada|mexico|brazil|argentina|chile|colombia|peru|' +
    'united kingdom|uk|england|scotland|wales|ireland|france|germany|spain|portugal|italy|netherlands|' +
    'belgium|luxembourg|switzerland|austria|denmark|sweden|norway|finland|iceland|poland|czechia|' +
    'czech republic|slovakia|hungary|romania|bulgaria|greece|turkey|türkiye|ukraine|estonia|latvia|' +
    'lithuania|croatia|serbia|slovenia|israel|egypt|morocco|nigeria|kenya|ghana|south africa|' +
    'united arab emirates|uae|saudi arabia|qatar|india|pakistan|bangladesh|sri lanka|nepal|china|' +
    'hong kong|taiwan|japan|south korea|korea|singapore|malaysia|indonesia|thailand|vietnam|philippines|' +
    'australia|new zealand'
  ).split('|'),
);
/** A 'City, X' left part containing one of these is a job line, not a place. */
const JOB_TITLE_WORDS = new Set(
  (
    'engineer engineering manager management developer development designer design analyst consultant ' +
    'director lead architect specialist scientist intern assistant associate officer administrator ' +
    'coordinator technician head president founder programmer owner executive representative ' +
    'supervisor advisor recruiter senior junior principal staff platform team'
  ).split(' '),
);
const INSTITUTION_RE = /\b(University|College|Institute|School|Academy|Polytechnic)\b/i;
const DEGREE_RE =
  /(?<![A-Za-z])(B\.S\.?|B\.A\.?|BSc|BEng|BS|BA|M\.S\.?|M\.A\.?|MSc|MEng|MS|MBA|Ph\.?D\.?|Ed\.?D\.?|Bachelor(?:'s)?|Master(?:'s)?|Associate(?:'s)?|Doctor(?:ate)?|Diploma)(?![A-Za-z])/;
const YEAR_RE = /(?<!\d)(19|20)\d{2}(?!\d)/g;
const TITLE_SEPARATORS = [' — ', ' – ', ' - ', ' at ', ' | ', ', '];
const BULLET_RE = /^\s*(?:[-*•·▪◦‣–—]|\d+[.)])\s+/;

function normHeading(line: string): string {
  return line
    .trim()
    .replace(/[:：]\s*$/, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function wordCount(s: string): number {
  return s.split(/\s+/).filter(Boolean).length;
}

function isBullet(line: string): boolean {
  return BULLET_RE.test(line);
}

/** Short (<= 4 words) Title Case / ALL CAPS line without digits, '@', bullets or separators. */
function isHeadingShaped(line: string): boolean {
  const t = line.trim().replace(/[:：]\s*$/, '');
  if (!t || isBullet(t) || /\d|@/.test(t) || /[,|•.;!?()]/.test(t) || /\s[-–—]\s/.test(t)) return false;
  const words = t.split(/\s+/);
  if (words.length > 4 || !words.some((w) => /\p{L}{2,}/u.test(w))) return false;
  const allCaps = t === t.toUpperCase() && /\p{Lu}/u.test(t);
  const titleCase = words.every((w) => SMALL_WORDS.has(w.toLowerCase()) || /^\p{Lu}/u.test(w));
  return allCaps || titleCase;
}

function hasHeadingVocab(line: string): boolean {
  return line
    .toLowerCase()
    .split(/[^\p{L}]+/u)
    .some((w) => HEADING_VOCAB.has(w));
}

function hasJobTitleWord(text: string): boolean {
  return text
    .toLowerCase()
    .split(/[^\p{L}]+/u)
    .some((w) => JOB_TITLE_WORDS.has(w));
}

function hasContactData(line: string): boolean {
  return EMAIL_RE.test(line) || PHONE_RES.some((r) => r.test(line)) || new RegExp(LINK_RE.source, 'i').test(line);
}

function isNameLine(t: string): boolean {
  return !/\d|@/.test(t) && NAME_RE.test(t) && !hasHeadingVocab(t) && !hasJobTitleWord(t);
}

/** 'Austin, TX' (preferred) or 'City, Country' for a country in COUNTRIES; never a job line. */
function matchLocation(segment: string, kind: 'us' | 'country'): string | undefined {
  const seg = segment.trim();
  if (!seg || EMAIL_RE.test(seg)) return undefined;
  if (kind === 'us') {
    const m = seg.match(US_LOCATION_RE);
    if (m && US_STATES.has(m[2]) && !hasJobTitleWord(m[1])) return `${m[1]}, ${m[2]}`;
    return undefined;
  }
  const m = seg.match(COUNTRY_LOCATION_RE);
  if (m && COUNTRIES.has(m[2].trim().toLowerCase()) && !hasJobTitleWord(m[1])) return seg;
  return undefined;
}

function stripBullet(line: string): string {
  return line.replace(BULLET_RE, '').trim();
}

function splitTitleEmployer(text: string): { title?: string; employer?: string } {
  const t = text.trim().replace(/^[\s|,–—-]+|[\s|,–—(-]+$/g, '').trim();
  if (!t) return {};
  for (const sep of TITLE_SEPARATORS) {
    const i = t.indexOf(sep);
    if (i > 0) {
      const title = t.slice(0, i).trim();
      const employer = t
        .slice(i + sep.length)
        .replace(/^[\s|,–—-]+|[\s|,–—-]+$/g, '')
        .trim();
      return { title: title || undefined, employer: employer || undefined };
    }
  }
  return { title: t };
}

function looksLikeTitleLine(line: string | undefined): line is string {
  if (!line) return false;
  const t = line.trim();
  return !!t && !isBullet(t) && wordCount(t) <= 10 && !/[.!?]$/.test(t) && findDateRanges(t).length === 0;
}

function parseContact(topLines: string[], text: string): Contact {
  const contact: Contact = { links: [] };
  const email = text.match(EMAIL_RE);
  if (email) contact.email = email[0];
  for (const re of PHONE_RES) {
    const m = text.match(re);
    if (m) {
      const digits = m[0].replace(/\D/g, '');
      if (digits.length >= 10 && digits.length <= 15) {
        contact.phone = m[0].trim();
        break;
      }
    }
  }
  const links = new Set<string>();
  for (const m of text.matchAll(LINK_RE)) {
    const link = m[0].replace(/[),.;]+$/, '');
    if (!link.includes('@')) links.add(link);
  }
  contact.links = [...links];

  const name = topLines.find((t) => isNameLine(t.trim()));
  if (name) contact.name = name.trim();
  const segments = topLines.flatMap((raw) => raw.split(/\s*[|•·]\s*|\s{3,}/));
  for (const kind of ['us', 'country'] as const) {
    for (const seg of segments) {
      const loc = matchLocation(seg, kind);
      if (loc) {
        contact.location = loc;
        break;
      }
    }
    if (contact.location) break;
  }
  return contact;
}

function parseExperience(
  lines: string[],
  formats: DateFormatId[],
  unparsed: string[],
): Job[] {
  const jobs: Job[] = [];
  const used = new Set<number>();
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    for (const tok of findDateTokens(line)) {
      if (isUnreadable(tok, formats) && !unparsed.includes(tok)) unparsed.push(tok);
    }
    const ranges = findDateRanges(line);
    if (ranges.length === 0) continue;
    const r = ranges[0];
    const job: Job = { rawDates: r.raw };
    const start = parseDate(r.startRaw, formats);
    const end = parseDate(r.endRaw, formats);
    if (start && start !== 'present') job.start = start;
    if (end) job.end = end;

    const residual = (line.slice(0, r.index) + ' ' + line.slice(r.index + r.raw.length))
      .replace(/[()[\]]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    let te = residual.replace(/^[\s|,–—-]+|[\s|,–—-]+$/g, '') ? splitTitleEmployer(residual) : {};
    if (!te.title) {
      const prev = i - 1;
      if (prev >= 0 && !used.has(prev) && looksLikeTitleLine(lines[prev])) {
        te = splitTitleEmployer(lines[prev]);
        used.add(prev);
        // "Title\nEmployer\nDates" layout
        const prev2 = i - 2;
        if (!te.employer && prev2 >= 0 && !used.has(prev2) && looksLikeTitleLine(lines[prev2])) {
          te = { title: lines[prev2].trim(), employer: te.title };
          used.add(prev2);
        }
      }
    } else if (!te.employer) {
      // "Title (dates)\nEmployer" or "Employer\nTitle dates"
      const prev = i - 1;
      if (prev >= 0 && !used.has(prev) && looksLikeTitleLine(lines[prev])) {
        te = { title: te.title, employer: lines[prev].trim() };
        used.add(prev);
      }
    }
    used.add(i);
    if (te.title) job.title = te.title;
    if (te.employer) job.employer = te.employer;
    jobs.push(job);
  }
  return jobs;
}

function parseEducation(lines: string[]): Education[] {
  const out: Education[] = [];
  let cur: Education | undefined;
  for (const raw of lines) {
    const line = stripBullet(raw);
    if (!line) continue;
    const segs = line.split(/\s*[,|•·]\s*|\s[-–—]\s/).map((s) => s.trim()).filter(Boolean);
    const inst = segs.find((s) => INSTITUTION_RE.test(s));
    const degSeg = segs.find((s) => DEGREE_RE.test(s) && !INSTITUTION_RE.test(s)) ??
      (DEGREE_RE.test(line) ? line.match(DEGREE_RE)?.[0] : undefined);
    const years = [...line.matchAll(YEAR_RE)].map((m) => m[0]);
    if (!inst && !degSeg && years.length === 0) continue;
    if (!cur || (inst && cur.institution) || (degSeg && cur.degree)) {
      if (!inst && !degSeg) {
        if (cur && !cur.year) cur.year = years[years.length - 1];
        continue;
      }
      cur = {};
      out.push(cur);
    }
    if (inst && !cur.institution) cur.institution = inst;
    if (degSeg && !cur.degree) cur.degree = degSeg;
    if (years.length && !cur.year) cur.year = years[years.length - 1];
  }
  return out;
}

function parseSkills(lines: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of lines) {
    let line = stripBullet(raw);
    // "Languages: JavaScript, Python" -> keep the list after the label
    const colon = line.match(/^[A-Za-z][A-Za-z &/-]{0,30}:\s*(.+)$/);
    if (colon) line = colon[1];
    for (const part of line.split(/[,;|•·\n]/)) {
      const s = part.trim().replace(/^[-*]\s*/, '').replace(/[.]$/, '').trim();
      if (!s || s.length > 50) continue;
      const key = s.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(s);
    }
  }
  return out;
}

export function parseResume(text: string, opts: ParseOptions): ParsedResume {
  const headingMap = new Map<string, SectionKind>();
  for (const [kind, list] of Object.entries(opts.headings) as [SectionKind, string[] | undefined][]) {
    for (const h of list ?? []) headingMap.set(normHeading(h), kind);
  }

  const lines = text.split(/\r?\n/);
  const sections: SectionHit[] = [];
  const bySection: Record<SectionKind | 'none', string[]> = {
    none: [],
    summary: [],
    experience: [],
    education: [],
    skills: [],
    projects: [],
    certifications: [],
    contact: [],
    other: [],
  };
  let current: SectionKind | 'none' = 'none';
  const topLines: string[] = [];
  let seenHeading = false;
  let nameSeen = false;
  const nextNonEmpty = (from: number): string | undefined => {
    for (let j = from; j < lines.length; j++) if (lines[j].trim()) return lines[j].trim();
    return undefined;
  };
  const indexOfNextNonEmpty = (from: number): number => {
    for (let j = from; j < lines.length; j++) if (lines[j].trim()) return j;
    return lines.length;
  };
  const LIST_SECTIONS: (SectionKind | 'none')[] = ['skills', 'projects', 'certifications', 'education'];
  const isUnknownHeading = (t: string, i: number): boolean => {
    if (!isHeadingShaped(t)) return false;
    if (!seenHeading && !nameSeen && isNameLine(t)) return false; // the name line
    if (hasContactData(t) || matchLocation(t, 'us') || matchLocation(t, 'country')) return false;
    if (hasJobTitleWord(t) || INSTITUTION_RE.test(t) || DEGREE_RE.test(t)) return false;
    if (LIST_SECTIONS.includes(current) && !hasHeadingVocab(t) && !/[:：]\s*$/.test(t)) return false;
    const n1 = indexOfNextNonEmpty(i + 1);
    const next = lines[n1]?.trim();
    if (!next) return false; // must be followed by content
    // a job: 'Title' + dates, or 'Title' / 'Employer' / dates
    if (findDateRanges(next).length > 0) return false;
    const next2 = nextNonEmpty(n1 + 1);
    const nextIsPlain = !TITLE_SEPARATORS.some((sep) => next.includes(sep)) && wordCount(next) <= 6;
    if (nextIsPlain && next2 && findDateRanges(next2).length > 0) return false;
    return true;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const t = line.trim();
    if (!t) continue;
    const norm = normHeading(t);
    const known = wordCount(norm) <= 4 ? headingMap.get(norm) : undefined;
    if (known) {
      sections.push({ heading: t.replace(/[:：]\s*$/, ''), recognized: true, canonical: known });
      current = known;
      seenHeading = true;
      continue;
    }
    if (findDateTokens(t).length === 0 && isUnknownHeading(t, i)) {
      sections.push({ heading: t.replace(/[:：]\s*$/, ''), recognized: false });
      current = 'other';
      seenHeading = true;
      continue;
    }
    if (!seenHeading && !nameSeen && isNameLine(t)) nameSeen = true;
    if (!seenHeading && topLines.length < 10) topLines.push(t);
    bySection[current].push(line);
  }

  const unparsedDates: string[] = [];
  return {
    contact: parseContact(topLines, text),
    experience: parseExperience(bySection.experience, opts.dateFormats, unparsedDates),
    education: parseEducation(bySection.education),
    skills: parseSkills(bySection.skills),
    sections,
    unparsedDates,
  };
}
