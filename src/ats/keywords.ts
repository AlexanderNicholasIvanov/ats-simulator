// Job-description keyword extraction and the three match modes ATSs use.
import type { KeywordMode } from '../types.ts';

export const MAX_KEYWORDS = 30;

const STOPWORDS = new Set(
  (
    'a about above across after again against all also am an and any are as at be because been before being below ' +
    'between both but by can could did do does doing down during each either etc few for from further had has have ' +
    'having he her here hers him his how i if in into is it its itself just me more most must my no nor not of off ' +
    'on once only or other our ours out over own per same she should so some such than that the their theirs them ' +
    'then there these they this those through to too under until up us very via was we were what when where which ' +
    'while who whom why will with within without would you your yours e.g i.e let lets get gets got go goes going ' +
    'come comes take takes put puts keep keeps really always often may might shall yet still even ever'
  ).split(/\s+/),
);

/** Words common in job ads that say nothing about the skills being screened for. */
const GENERIC = new Set(
  (
    'ability able about-the-role apply applicant applicants around benefit benefits best bonus build building ' +
    'candidate candidates career champion closely collaborate company corp culture customer-facing daily day ' +
    'deliver desire desired develop duties effective employer environment equal example excellent existing ' +
    'experience experienced familiarity fast-paced fictional good great hands-on help high highly ideal ' +
    'including inc join junior knowledge level llc ltd lead leading like location looking maintain mid ' +
    'mid-level new nice offer opportunity our paced passion passionate plus position practices preferred ' +
    'professional proficiency proficient qualifications related remote required requirements responsibilities ' +
    'responsible role salary senior skill skills strong success successful team teams together understanding ' +
    'using well work working world year years design own ensure across make makes multiple various ' +
    'within willing etc look seeking hire hiring part full-time full time based us engineer engineers ' +
    'platform features initiatives development cross-team use uses used requires require requiring ' +
    'need needs needed want wants wanted works worked join joining joins seek seeks bring brings offer offers ' +
    'get thing things way ways lot lots kind something someone anyone everyone people person time times ' +
    'today tomorrow week weeks month months day days place help helps helping grow growing growth love ' +
    'enjoy exciting excited mission vision values impact big small large great awesome amazing'
  ).split(/\s+/),
);

/** Multi-word and punctuated terms kept whole (lower-case). */
export const TERM_DICTIONARY: string[] = [
  'amazon web services',
  'google cloud platform',
  'machine learning',
  'deep learning',
  'natural language processing',
  'computer vision',
  'artificial intelligence',
  'data science',
  'data analysis',
  'data engineering',
  'data visualization',
  'project management',
  'product management',
  'program management',
  'stakeholder management',
  'change management',
  'customer service',
  'customer success',
  'business analysis',
  'business development',
  'supply chain',
  'quality assurance',
  'unit testing',
  'test automation',
  'automated testing',
  'continuous integration',
  'continuous delivery',
  'version control',
  'agile methodology',
  'cross-functional',
  'github actions',
  'rest api',
  'rest apis',
  'react native',
  'ruby on rails',
  'spring boot',
  'power bi',
  'microsoft excel',
  'google analytics',
  'ci/cd',
  'node.js',
  'next.js',
  'vue.js',
  'react.js',
  'express.js',
  '.net',
  'asp.net',
  'c++',
  'c#',
  'objective-c',
];

const SYNONYM_GROUPS: string[][] = [
  ['javascript', 'js', 'ecmascript'],
  ['typescript', 'ts'],
  ['kubernetes', 'k8s'],
  ['amazon web services', 'aws'],
  ['google cloud platform', 'gcp', 'google cloud'],
  ['microsoft azure', 'azure'],
  ['postgresql', 'postgres', 'psql'],
  ['ci/cd', 'continuous integration', 'continuous delivery', 'continuous deployment'],
  ['machine learning', 'ml'],
  ['artificial intelligence', 'ai'],
  ['natural language processing', 'nlp'],
  ['node.js', 'nodejs', 'node'],
  ['react', 'react.js', 'reactjs'],
  ['vue', 'vue.js', 'vuejs'],
  ['next.js', 'nextjs'],
  ['c#', 'csharp'],
  ['golang', 'go lang'],
  ['accessibility', 'a11y', 'wcag'],
  ['user experience', 'ux'],
  ['user interface', 'ui'],
  ['quality assurance', 'qa'],
  ['mentoring', 'mentorship', 'coaching'],
  ['frontend', 'front-end', 'front end'],
  ['backend', 'back-end', 'back end'],
  ['rest api', 'rest apis', 'restful'],
  ['testing', 'test automation', 'automated testing', 'unit testing'],
  ['project management', 'project manager'],
  ['microsoft excel', 'excel'],
];

/**
 * 1-2 letter skills, accepted only in exactly this casing ('Go', not 'go') and only in a list-like
 * context ("Go and C", "R, Python", "with Go").
 */
const SHORT_TERMS = new Set(['C', 'R', 'Go', 'GO', 'JS', 'TS', 'AI', 'ML', 'UI', 'UX', 'QA', 'BI']);
const LIST_CONTEXT_WORDS = new Set(['and', 'or', 'with', 'in', 'using', 'use', 'uses', 'like', 'including', 'plus']);

/**
 * Tool and technology names: always kept as keywords, and never stemmed ('docker' must not equal 'docking').
 */
const TECH_WORDS = new Set(
  (
    'docker kubernetes jenkins terraform ansible kafka spark hadoop redis mongodb mysql postgresql postgres ' +
    'graphql react angular vue svelte typescript javascript python java kotlin swift rust ruby rails php ' +
    'scala golang perl matlab excel tableau looker snowflake airflow pandas numpy pytorch tensorflow jest ' +
    'cypress playwright selenium webpack vite express django flask laravel linux unix bash git github gitlab ' +
    'jira confluence figma sketch sql nosql html css sass aws azure gcp lambda serverless kanban saas ' +
    'b2b seo crm erp salesforce sap wcag'
  ).split(/\s+/),
);

/** Skill words that are always kept as keywords even if they occur once (these are stemmed normally). */
const SKILL_WORDS = new Set(
  (
    'accessibility testing mentoring leadership communication analytics security debugging devops agile ' +
    'scrum frontend backend fullstack api apis rest microservices stakeholders deployments pipelines ' +
    'automation monitoring observability performance documentation'
  ).split(/\s+/),
);

/** Characters that continue a word: 'go' does not match inside 'go-to' or 'golang'. */
const WORD_CHARS = 'a-z0-9+#\\-';

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
}

/** Case-insensitive whole-term regex; inner whitespace matches any whitespace run. */
function termRegex(term: string, flags = 'i'): RegExp {
  const body = term
    .trim()
    .split(/\s+/)
    .map(escapeRe)
    .join('\\s+');
  return new RegExp(`(?<![${WORD_CHARS}])${body}(?![${WORD_CHARS}])`, flags);
}

/** Simple suffix stripper: 'managed' ~ 'management' ~ 'manage' -> 'manag'. */
export function stem(word: string): string {
  let w = word.toLowerCase();
  if (!/^[a-z]+$/.test(w) || TECH_WORDS.has(w)) return w;
  if (w.length <= 3) return w;
  const rules: [string, string][] = [
    ['ibility', 'ibl'],
    ['ability', 'abl'],
    ['ations', ''],
    ['ation', ''],
    ['ments', ''],
    ['ment', ''],
    ['ings', ''],
    ['ing', ''],
    ['ions', ''],
    ['ion', ''],
    ['ies', 'y'],
    ['ied', 'y'],
    ['ers', ''],
    ['er', ''],
    ['ed', ''],
    ['es', ''],
    ['s', ''],
  ];
  for (const [suf, rep] of rules) {
    if (w.endsWith(suf) && w.length - suf.length >= 3) {
      if (suf === 's' && w.endsWith('ss')) break;
      w = w.slice(0, w.length - suf.length) + rep;
      break;
    }
  }
  if (w.length > 3 && w.endsWith('e')) w = w.slice(0, -1);
  // collapse doubled final consonant: 'planned' -> 'plann' -> 'plan'
  if (w.length > 3 && /([b-df-hj-np-tv-z])\1$/.test(w) && !w.endsWith('ss') && !w.endsWith('ll')) {
    w = w.slice(0, -1);
  }
  return w;
}

/** Lower-case word tokens; keeps '+', '#', inner '.', '/', '-' (c++, node.js, ci/cd). */
export function tokenize(text: string): string[] {
  const out: string[] = [];
  for (const m of text.toLowerCase().matchAll(/[a-z0-9+#][a-z0-9+#./-]*/g)) {
    const t = m[0].replace(/[./-]+$/, '');
    if (t) out.push(t);
  }
  return out;
}

/** Stems of every token, plus the parts of compound tokens ('react/typescript' -> both). */
function stemTokens(text: string): string[] {
  const out: string[] = [];
  for (const t of tokenize(text)) {
    const parts = t.split(/[/-]/).filter(Boolean);
    if (parts.length > 1) {
      for (const p of parts) out.push(stem(p));
    } else {
      out.push(stem(t));
    }
  }
  return out;
}

function keepToken(t: string): boolean {
  if (STOPWORDS.has(t) || GENERIC.has(t)) return false;
  if (/^[\d.,+%-]+$/.test(t)) return false;
  if (t.length < 3) return false;
  return /[a-z]/.test(t);
}

/** True when the token starts a sentence, line or bullet (so its capital letter means nothing). */
function sentenceInitial(text: string, index: number): boolean {
  let i = index - 1;
  while (i >= 0 && (text[i] === ' ' || text[i] === '\t')) i--;
  return i < 0 || /[.!?:\n\r•*\-–—(]/.test(text[i]);
}

/** A list-like context: next to ',', '/', ';', '(' or a word such as 'and' / 'with'. */
function listContext(text: string, index: number, length: number): boolean {
  const before = text.slice(Math.max(0, index - 20), index);
  const after = text.slice(index + length, index + length + 20);
  if (/[,/;(]\s*$/.test(before) || /^\s*[,/;)]/.test(after)) return true;
  const prevWord = before.match(/([A-Za-z]+)\s+$/)?.[1]?.toLowerCase();
  const nextWord = after.match(/^\s+([A-Za-z]+)/)?.[1]?.toLowerCase();
  return (!!prevWord && LIST_CONTEXT_WORDS.has(prevWord)) || (!!nextWord && LIST_CONTEXT_WORDS.has(nextWord));
}

/** Up to ~30 JD keywords, most frequent first (ties: first appearance), in the JD's own spelling. */
export function extractKeywords(jd: string): string[] {
  const counts = new Map<string, { count: number; first: number; spelling: string; strong: boolean }>();
  const add = (key: string, spelling: string, index: number, strong = true) => {
    const cur = counts.get(key);
    if (cur) {
      cur.count++;
      cur.strong ||= strong;
      // prefer a lower-case spelling over a sentence-initial capital ('Testing' -> 'testing')
      if (spelling === key && cur.spelling !== key && cur.spelling.slice(1) === key.slice(1)) cur.spelling = spelling;
    } else counts.set(key, { count: 1, first: index, spelling, strong });
  };

  // 1. dictionary terms, longest first, blanked out so their words are not counted again
  let rest = jd;
  const dict = [...TERM_DICTIONARY].sort((a, b) => b.length - a.length);
  for (const term of dict) {
    const re = termRegex(term, 'gi');
    rest = rest.replace(re, (match: string, offset: number) => {
      add(term, match.replace(/\s+/g, ' '), offset);
      return ' '.repeat(match.length);
    });
  }

  // 2. remaining single tokens. A plain lower-case word must repeat to count; tech words, terms with
  // digits/symbols/inner capitals and capitalised words mid-sentence count at once.
  for (const m of rest.matchAll(/[A-Za-z0-9+#][A-Za-z0-9+#./-]*/g)) {
    const spelling = m[0].replace(/[./-]+$/, '');
    const key = spelling.toLowerCase();
    const index = m.index ?? 0;
    if (key.length <= 2) {
      if (SHORT_TERMS.has(spelling) && listContext(rest, index, spelling.length)) add(key, spelling, index);
      continue;
    }
    if (!keepToken(key)) continue;
    const strong =
      TECH_WORDS.has(key) ||
      SKILL_WORDS.has(key) ||
      /[^a-z]/.test(key) ||
      /[A-Z]/.test(spelling.slice(1)) ||
      (/^[A-Z]/.test(spelling) && !sentenceInitial(rest, index));
    add(key, spelling, index, strong);
  }

  // Merge single words that are plural/inflected forms of the same stem (keep first spelling).
  const byStem = new Map<string, string>();
  for (const [key, v] of [...counts.entries()].sort((a, b) => a[1].first - b[1].first)) {
    if (key.includes(' ') || !/^[a-z]+$/.test(key)) continue;
    const s = stem(key);
    const owner = byStem.get(s);
    if (owner && owner !== key) {
      const o = counts.get(owner);
      if (o) {
        o.count += v.count;
        o.strong ||= v.strong;
      }
      counts.delete(key);
    } else {
      byStem.set(s, key);
    }
  }

  return [...counts.values()]
    .filter((v) => v.strong || v.count >= 2)
    .sort((a, b) => b.count - a.count || a.first - b.first)
    .slice(0, MAX_KEYWORDS)
    .map((v) => v.spelling);
}

function synonymsOf(term: string): string[] {
  const key = term.toLowerCase();
  const out = new Set<string>();
  for (const g of SYNONYM_GROUPS) {
    if (g.includes(key)) for (const s of g) if (s !== key) out.add(s);
  }
  return [...out];
}

function exactMatch(term: string, text: string, caseSensitive = false): boolean {
  return termRegex(term, caseSensitive ? '' : 'i').test(text);
}

/** 1-2 letter terms ('C', 'R', 'Go') only match in the JD's casing, and never by stem. */
function isShort(term: string): boolean {
  return term.trim().length <= 2;
}

function stemMatch(term: string, stems: string[], stemSet: Set<string>): boolean {
  const words = term
    .toLowerCase()
    .split(/[\s/-]+/)
    .filter(Boolean)
    .map(stem);
  if (words.length === 0) return false;
  if (words.length === 1) return stemSet.has(words[0]);
  // every word of the term within a small window, any order ('managed projects' ~ 'project management')
  const win = words.length + 3;
  for (let i = 0; i < stems.length; i++) {
    if (!words.includes(stems[i])) continue;
    const slice = stems.slice(Math.max(0, i - win), i + win + 1);
    if (words.every((w) => slice.includes(w))) return true;
  }
  return false;
}

export interface KeywordMatch {
  matched: string[];
  missing: string[];
}

export function matchKeywords(keywords: string[], resumeText: string, mode: KeywordMode): KeywordMatch {
  const stems = stemTokens(resumeText);
  const stemSet = new Set(stems);
  const matched: string[] = [];
  const missing: string[] = [];
  for (const term of keywords) {
    const candidates = mode === 'synonym' ? [term, ...synonymsOf(term)] : [term];
    const ok = candidates.some((c, i) =>
      isShort(c)
        ? exactMatch(c, resumeText, i === 0)
        : exactMatch(c, resumeText) || (mode !== 'exact' && stemMatch(c, stems, stemSet)),
    );
    (ok ? matched : missing).push(term);
  }
  return { matched, missing };
}

/** extractKeywords + matchKeywords. */
export function matchJob(jd: string, resumeText: string, mode: KeywordMode): KeywordMatch {
  return matchKeywords(extractKeywords(jd), resumeText, mode);
}
