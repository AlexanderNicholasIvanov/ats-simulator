import { describe, expect, it } from 'vitest';
import { buildReport, PROFILES, rankResults, simulate, simulateAll } from '../../src/ats/index.ts';
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
    expect(taleo.warnings.map((w) => w.code)).toEqual(['no-text']);
    expect(taleo.score).toBe(0);
    const greenhouse = simulate(doc, SAMPLE_JD, PROFILES[3]);
    expect(greenhouse.parsed.contact.email).toBe('jordan.rivera@example.com');
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
  it('orders by score/searchMatch, then fieldsFound, then fewer errors; stable; does not mutate', () => {
    const err = { severity: 'error' as const, code: 'header-contact', message: 'x' };
    const input = [
      fakeResult({ profileId: 'none', score: null, searchMatch: null, fieldsFound: 7 }),
      fakeResult({ profileId: 'a60', score: 60, fieldsFound: 5 }),
      fakeResult({ profileId: 's80', searchMatch: 80, fieldsFound: 4 }),
      fakeResult({ profileId: 'a60-more-fields', score: 60, fieldsFound: 6 }),
      fakeResult({ profileId: 'a60-error', score: 60, fieldsFound: 5, warnings: [err] }),
      fakeResult({ profileId: 'a60-twin', score: 60, fieldsFound: 5 }),
      fakeResult({ profileId: 'zero', score: 0, fieldsFound: 0 }),
    ];
    const before = input.map((r) => r.profileId);
    const ranked = rankResults(input);
    expect(ranked.map((r) => r.profileId)).toEqual([
      's80',
      'a60-more-fields',
      'a60',
      'a60-twin',
      'a60-error',
      'zero',
      'none',
    ]);
    expect(input.map((r) => r.profileId)).toEqual(before);
    expect(ranked).not.toBe(input);
  });

  it('ranks the real sample results', () => {
    const ranked = rankResults(simulateAll(sampleDoc(), SAMPLE_JD));
    expect(ranked).toHaveLength(8);
    const keys = ranked.map((r) => r.score ?? r.searchMatch ?? -1);
    expect([...keys].sort((a, b) => b - a)).toEqual(keys);
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
