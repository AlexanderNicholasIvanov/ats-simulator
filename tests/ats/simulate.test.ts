import { describe, expect, it } from 'vitest';
import { buildReport, outcome, PROFILES, rankResults, simulate, simulateAll } from '../../src/ats/index.ts';
import { SAMPLE_JD, SAMPLE_RESUME_TEXT } from '../../src/sample/index.ts';
import type { Line } from '../../src/types.ts';
import { docFromLines, docFromText, fakeResult, textToLines } from './helpers.ts';

const sampleDoc = () => docFromText(SAMPLE_RESUME_TEXT, 'paste');

describe('simulateAll with the sample resume and JD (criterion 5)', () => {
  const results = simulateAll(sampleDoc(), SAMPLE_JD);

  it('returns 8 results in PROFILES order', () => {
    expect(results).toHaveLength(8);
    expect(results.map((r) => r.profileId)).toEqual(PROFILES.map((p) => p.id));
    expect(results.map((r) => r.profileName)).toEqual(PROFILES.map((p) => p.name));
  });

  it('parses every field and scores 0-100 on scoring profiles', () => {
    for (const r of results) {
      expect(r.jdProvided).toBe(true);
      expect(r.fieldsTotal).toBe(7);
      expect(r.rawText).toBe(SAMPLE_RESUME_TEXT);
      expect(r.matched.length).toBeGreaterThan(0);
      expect(r.matched.length + r.missing.length).toBeGreaterThan(5);
      if (r.profileId !== 'taleo') expect(r.fieldsFound).toBe(7);
      const value = r.score ?? r.searchMatch;
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(100);
    }
  });

  it('Taleo cannot read month-name dates in the sample', () => {
    const taleo = results.find((r) => r.profileId === 'taleo');
    expect(taleo?.warnings).toContainEqual(expect.objectContaining({ code: 'date-format', severity: 'warning' }));
    expect(taleo?.parsed.unparsedDates).toEqual(['Mar 2021']);
  });

  it('exact-match profiles miss more keywords than synonym profiles', () => {
    const taleo = results.find((r) => r.profileId === 'taleo');
    const greenhouse = results.find((r) => r.profileId === 'greenhouse');
    expect(taleo?.missing.length).toBeGreaterThan(greenhouse?.missing.length ?? 0);
  });

  it('computes the score from the profile weights', () => {
    const workday = PROFILES[0];
    const r = results[0];
    const terms = r.matched.length + r.missing.length;
    const expected = Math.round(
      100 *
        (workday.weights.keywords * (r.matched.length / terms) +
          workday.weights.completeness * (r.fieldsFound / 7) +
          workday.weights.formatting * 1),
    );
    expect(r.warnings).toEqual([]);
    expect(r.score).toBe(expected);
  });
});

describe('search-match profiles (criterion 9)', () => {
  it('Greenhouse and Lever return score null and a numeric searchMatch when a JD is given', () => {
    for (const id of ['greenhouse', 'lever']) {
      const r = simulateAll(sampleDoc(), SAMPLE_JD).find((x) => x.profileId === id);
      expect(r?.score).toBeNull();
      expect(typeof r?.searchMatch).toBe('number');
      const terms = (r?.matched.length ?? 0) + (r?.missing.length ?? 0);
      expect(r?.searchMatch).toBe(Math.round((100 * (r?.matched.length ?? 0)) / terms));
    }
  });
});

describe('no job description (criterion 10)', () => {
  it.each([undefined, '', '   \n '])('jd=%j -> no score, parse and warnings still present', (jd) => {
    const doc = docFromText(SAMPLE_RESUME_TEXT, 'pdf');
    for (const r of simulateAll(doc, jd)) {
      expect(r.jdProvided).toBe(false);
      expect(r.score).toBeNull();
      expect(r.searchMatch).toBeNull();
      expect(r.matched).toEqual([]);
      expect(r.missing).toEqual([]);
      expect(r.parsed.contact.email).toBe('jordan.rivera@example.com');
      expect(r.fieldsFound).toBeGreaterThan(0);
    }
    const taleo = simulate(doc, jd, PROFILES[1]);
    expect(taleo.warnings.map((w) => w.code)).toEqual(['format', 'date-format']);
  });
});

describe('image-only / empty documents (criterion 3)', () => {
  const imageOnly = docFromLines([], { kind: 'pdf', fileName: 'scan.pdf', pages: 2, layout: {
    columns: 1,
    hasTables: false,
    hasTextBoxes: false,
    headerText: '',
    footerText: '',
    imageOnly: true,
  } });

  it.each([undefined, SAMPLE_JD])('every profile returns exactly one no-text error (jd=%#)', (jd) => {
    const results = simulateAll(imageOnly, jd);
    expect(results).toHaveLength(8);
    for (const r of results) {
      expect(r.warnings).toEqual([
        { severity: 'error', code: 'no-text', message: 'No text extracted - this ATS would see an empty resume.' },
      ]);
      expect(r.fieldsFound).toBe(0);
      expect(r.rawText).toBe('');
    }
  });

  it('a document whose only text a strict parser drops is also empty for that parser', () => {
    const lines: Line[] = textToLines('Jordan Rivera\njordan.rivera@example.com').map((l) => ({ ...l, region: 'header' }));
    const doc = docFromLines(lines, { kind: 'docx' });
    const taleo = simulate(doc, SAMPLE_JD, PROFILES[1]);
    // The no-text error plus the parser-view warning that explains why the text is gone.
    expect(taleo.warnings.map((w) => w.code)).toEqual(['no-text', 'header-contact']);
    expect(taleo.score).toBe(0);
    const greenhouse = simulate(doc, SAMPLE_JD, PROFILES[3]);
    expect(greenhouse.parsed.contact.email).toBe('jordan.rivera@example.com');
  });

  it('keeps the table / text-box warnings that explain an empty parser view', () => {
    const lines = textToLines('Python, SQL\nGo, Rust');
    lines[0] = { ...lines[0], inTable: true };
    lines[1] = { ...lines[1], inTextBox: true };
    const taleo = simulate(docFromLines(lines, { kind: 'docx' }), undefined, PROFILES[1]);
    expect(taleo.warnings.map((w) => w.code)).toEqual(['no-text', 'table', 'text-box']);
  });
});

describe('layout rules', () => {
  it('drops table and text-box lines on profiles that cannot read them', () => {
    const lines = textToLines('Jordan Rivera\nSkills\nPython, SQL\nGo, Rust');
    lines[2] = { ...lines[2], inTable: true };
    lines[3] = { ...lines[3], inTextBox: true };
    const doc = docFromLines(lines, { kind: 'docx' });
    const taleo = simulate(doc, undefined, PROFILES[1]);
    expect(taleo.warnings.map((w) => w.code)).toEqual(['table', 'text-box']);
    expect(taleo.parsed.skills).toEqual([]);
    const greenhouse = simulate(doc, undefined, PROFILES[3]);
    expect(greenhouse.warnings).toEqual([]);
    expect(greenhouse.parsed.skills).toEqual(['Python', 'SQL', 'Go', 'Rust']);
  });

  it('reports headings a strict profile does not know', () => {
    const doc = docFromText(SAMPLE_RESUME_TEXT.replace('\nExperience\n', '\nCareer History\n'));
    const taleo = simulate(doc, undefined, PROFILES[1]);
    expect(taleo.warnings).toContainEqual(expect.objectContaining({ code: 'unknown-heading' }));
    expect(taleo.parsed.experience).toEqual([]);
    const lever = simulate(doc, undefined, PROFILES[4]);
    expect(lever.warnings).toEqual([]);
    expect(lever.parsed.experience).toHaveLength(3);
  });
});

describe('rankResults', () => {
  const err = { severity: 'error' as const, code: 'header-contact', message: 'x' };
  const warn = { severity: 'warning' as const, code: 'table', message: 'x' };
  const kw = (matched: number, missing: number) => ({
    matched: Array.from({ length: matched }, (_, i) => `m${i}`),
    missing: Array.from({ length: missing }, (_, i) => `x${i}`),
  });

  it('computes one common outcome from match ratio, completeness and formatting', () => {
    // 0.5 * 3/4 + 0.3 * 7/7 + 0.2 * (1 - 0.25 - 0.1)
    expect(outcome(fakeResult({ profileId: 'a', fieldsFound: 7, ...kw(3, 1), warnings: [err, warn] }))).toBeCloseTo(
      0.375 + 0.3 + 0.13,
    );
    // no JD: (0.3 * 7/7 + 0.2 * 1) / 0.5
    expect(outcome(fakeResult({ profileId: 'b', fieldsFound: 7, jdProvided: false }))).toBeCloseTo(1);
    // the formatting penalty is capped at 1
    expect(outcome(fakeResult({ profileId: 'c', fieldsFound: 0, warnings: [err, err, err, err, err] }))).toBe(0);
  });

  it('ranks every result by the same outcome, not by its profile-specific score or search match', () => {
    // A search-match result with a high keyword-only % but few fields loses to a scored one with all fields.
    const searchHigh = fakeResult({ profileId: 'search', searchMatch: 80, fieldsFound: 2, ...kw(4, 1) });
    const scoredLow = fakeResult({ profileId: 'scored', score: 60, fieldsFound: 7, ...kw(3, 2) });
    expect(rankResults([searchHigh, scoredLow]).map((r) => r.profileId)).toEqual(['scored', 'search']);
  });

  it('breaks ties by more fieldsFound, then fewer errors, then input order; does not mutate', () => {
    const input = [
      fakeResult({ profileId: 'twin-1', fieldsFound: 5, ...kw(1, 1) }),
      fakeResult({ profileId: 'worse', fieldsFound: 1, ...kw(0, 1) }),
      fakeResult({ profileId: 'twin-2', fieldsFound: 5, ...kw(1, 1) }),
      fakeResult({ profileId: 'best', fieldsFound: 7, ...kw(2, 0) }),
    ];
    const before = input.map((r) => r.profileId);
    const ranked = rankResults(input);
    expect(ranked.map((r) => r.profileId)).toEqual(['best', 'twin-1', 'twin-2', 'worse']);
    expect(input.map((r) => r.profileId)).toEqual(before);
    expect(ranked).not.toBe(input);

    // Equal outcome 0.5: all fields but no keywords vs no fields and 3/5 keywords -> more fields first.
    const fieldTie = [
      fakeResult({ profileId: 'no-fields', fieldsFound: 0, ...kw(3, 2) }),
      fakeResult({ profileId: 'all-fields', fieldsFound: 7, ...kw(0, 5) }),
    ];
    expect(outcome(fieldTie[0])).toBe(outcome(fieldTie[1]));
    expect(rankResults(fieldTie).map((r) => r.profileId)).toEqual(['all-fields', 'no-fields']);

    // Equal outcome 0 (penalty capped) and equal fields: fewer errors first.
    const errorTie = [
      fakeResult({ profileId: 'errors-5', fieldsFound: 0, warnings: [err, err, err, err, err] }),
      fakeResult({ profileId: 'errors-4', fieldsFound: 0, warnings: [err, err, err, err] }),
    ];
    expect(errorTie.map(outcome)).toEqual([0, 0]);
    expect(rankResults(errorTie).map((r) => r.profileId)).toEqual(['errors-4', 'errors-5']);
  });

  it('ranks the real sample results by outcome, best first', () => {
    const ranked = rankResults(simulateAll(sampleDoc(), SAMPLE_JD));
    expect(ranked).toHaveLength(8);
    const keys = ranked.map(outcome);
    expect([...keys].sort((a, b) => b - a)).toEqual(keys);
  });
});

describe('job descriptions without keywords', () => {
  it('treats a JD with no recognisable keywords as no JD and adds a no-keywords note', () => {
    const jd = 'the and of to a';
    for (const r of simulateAll(sampleDoc(), jd)) {
      expect(r.jdProvided).toBe(false);
      expect(r.score).toBeNull();
      expect(r.searchMatch).toBeNull();
      expect(r.warnings).toContainEqual({
        severity: 'info',
        code: 'no-keywords',
        message: 'The job description has no recognisable keywords to score against.',
      });
    }
    expect(simulateAll(sampleDoc(), undefined).flatMap((r) => r.warnings.map((w) => w.code))).not.toContain(
      'no-keywords',
    );
  });
});

describe('keyword extraction', () => {
  it('simulate uses precomputed keywords when given, and simulateAll matches per-profile simulate', () => {
    const r = simulate(sampleDoc(), SAMPLE_JD, PROFILES[0], ['react', 'cobol']);
    expect(r.matched).toEqual(['react']);
    expect(r.missing).toEqual(['cobol']);
    expect(simulateAll(sampleDoc(), SAMPLE_JD)).toEqual(PROFILES.map((p) => simulate(sampleDoc(), SAMPLE_JD, p)));
  });
});

describe('header contact detection', () => {
  it('a dropped header holding only years is not reported as contact info', () => {
    const header: Line = { text: '2019 - 2021 2022', page: 1, x: 0, y: 0, column: 0, region: 'header' };
    const body = textToLines('Jordan Rivera\njordan.rivera@example.com').map((l) => ({ ...l, y: l.y + 1 }));
    const taleo = simulate(docFromLines([header, ...body], { kind: 'docx' }), undefined, PROFILES[1]);
    const codes = taleo.warnings.map((w) => w.code);
    expect(codes).not.toContain('header-contact');
    expect(codes).toContain('header');
  });
});

describe('buildReport (criterion 13)', () => {
  it('has one entry per result with score, matched, missing, warnings and fields', () => {
    const results = simulateAll(sampleDoc(), SAMPLE_JD);
    const report = buildReport('resume.pdf', results);
    expect(report.fileName).toBe('resume.pdf');
    expect(new Date(report.generatedAt).toISOString()).toBe(report.generatedAt);
    expect(report.results).toHaveLength(results.length);
    report.results.forEach((entry, i) => {
      const r = results[i];
      expect(entry).toEqual({
        profileId: r.profileId,
        profileName: r.profileName,
        score: r.score,
        searchMatch: r.searchMatch,
        matched: r.matched,
        missing: r.missing,
        warnings: r.warnings,
        fields: r.parsed,
      });
    });
    expect(() => JSON.parse(JSON.stringify(report))).not.toThrow();
  });
});
