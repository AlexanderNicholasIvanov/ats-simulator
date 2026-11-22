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
]);
const SMALL_WORDS = new Set(['of', 'and', '&', 'the', 'in', 'for', 'to', 'a', 'an', 'with', '/']);

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;
const PHONE_RES = [
  /(?<![\d])(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}(?!\d)/,
  /(?<![\d])\+\d{1,3}(?:[\s.-]?\(?\d{1,4}\)?){2,5}(?!\d)/,
];
const LINK_RE = /\b(?:https?:\/\/\S+|www\.\S+|(?:[a-z]{2,3}\.)?(?:linkedin|github)\.com\/\S+)/gi;
const LOCATION_RE =
  /^([A-Z][A-Za-z.'-]*(?:\s+[A-Z][A-Za-z.'-]*){0,3}),\s*([A-Z]{2}|[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)$/;
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

/** Short Title Case / ALL CAPS line with a heading word, no digits, no separators. */
function isHeadingShaped(line: string): boolean {
  const t = line.trim().replace(/[:：]\s*$/, '');
  if (!t || /\d|@/.test(t) || /[,|•.;!?()]/.test(t) || /\s[-–—]\s/.test(t)) return false;
  const words = t.split(/\s+/);
  if (words.length > 4) return false;
  const allCaps = t === t.toUpperCase() && /[A-Z]/.test(t);
  const titleCase = words.every((w) => SMALL_WORDS.has(w.toLowerCase()) || /^[A-Z]/.test(w));
  if (!allCaps && !titleCase) return false;
  return words.some((w) => HEADING_VOCAB.has(w.toLowerCase()));
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

  for (const raw of topLines) {
    const t = raw.trim();
    if (!t) continue;
    if (
      !/\d|@/.test(t) &&
      /^[A-Z][A-Za-z.'’-]*(?:\s+[A-Z][A-Za-z.'’-]*){1,3}$/.test(t) &&
      !isHeadingShaped(t)
    ) {
      contact.name = t;
      break;
    }
  }
  for (const raw of topLines) {
    for (const seg of raw.split(/\s*[|•·]\s*|\s{3,}/)) {
      const m = seg.trim().match(LOCATION_RE);
      if (m && !EMAIL_RE.test(seg)) {
        contact.location = seg.trim();
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
    // a title line directly followed by dates is a job, not a heading
    const nextHasRange = !!lines[i + 1] && findDateRanges(lines[i + 1]).length > 0;
    if (isHeadingShaped(t) && findDateTokens(t).length === 0 && !nextHasRange) {
      sections.push({ heading: t.replace(/[:：]\s*$/, ''), recognized: false });
      current = 'other';
      seenHeading = true;
      continue;
    }
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
