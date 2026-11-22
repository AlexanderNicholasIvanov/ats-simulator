import { describe, expect, it } from 'vitest';
import { extractKeywords, matchJob, matchKeywords, MAX_KEYWORDS, stem } from '../../src/ats/keywords.ts';
import { SAMPLE_JD } from '../../src/sample/index.ts';

const JD = 'Experience in project management and Kubernetes';
const RESUME = 'Managed projects for three product teams; services deployed on k8s with Helm.';

describe('extractKeywords', () => {
  it('drops stopwords and generic words, keeps multi-word terms', () => {
    expect(extractKeywords(JD)).toEqual(['project management', 'Kubernetes']);
  });

  it('keeps tech terms whole, most frequent first, capped', () => {
    const kws = extractKeywords(SAMPLE_JD);
    expect(kws.length).toBeLessThanOrEqual(MAX_KEYWORDS);
    expect(kws).toEqual(expect.arrayContaining(['React', 'TypeScript', 'CI/CD', 'AWS', 'GraphQL', 'project management']));
    // React and TypeScript appear 3 times in the sample JD; Kubernetes once
    expect(kws.indexOf('React')).toBeLessThan(kws.indexOf('Kubernetes'));
    for (const generic of ['experience', 'years', 'with', 'the', 'strong']) {
      expect(kws.map((k) => k.toLowerCase())).not.toContain(generic);
    }
  });

  it('caps the list at ~30 terms', () => {
    const many = Array.from({ length: 60 }, (_, i) => `tool${String.fromCharCode(97 + (i % 26))}${i}`).join(' ');
    expect(extractKeywords(many)).toHaveLength(MAX_KEYWORDS);
  });
});

describe('stem', () => {
  it("conflates 'managed' ~ 'management' ~ 'manage'", () => {
    expect(stem('managed')).toBe(stem('management'));
    expect(stem('manage')).toBe(stem('management'));
    expect(stem('manager')).toBe(stem('manage'));
    expect(stem('projects')).toBe('project');
    expect(stem('testing')).toBe(stem('tests'));
    expect(stem('kubernetes')).not.toBe(stem('k8s'));
  });
});

describe('match modes (criterion 8)', () => {
  it('exact misses both the management term and kubernetes', () => {
    const r = matchJob(JD, RESUME, 'exact');
    expect(r.matched).toEqual([]);
    expect(r.missing).toEqual(['project management', 'Kubernetes']);
  });

  it('stemmed matches the management term but not kubernetes', () => {
    const r = matchJob(JD, RESUME, 'stemmed');
    expect(r.matched).toEqual(['project management']);
    expect(r.missing).toEqual(['Kubernetes']);
  });

  it('synonym matches both', () => {
    const r = matchJob(JD, RESUME, 'synonym');
    expect(r.matched).toEqual(['project management', 'Kubernetes']);
    expect(r.missing).toEqual([]);
  });

  it('exact is case-insensitive and whole-term only', () => {
    expect(matchKeywords(['React', 'Java'], 'Built REACT apps in JavaScript', 'exact')).toEqual({
      matched: ['React'],
      missing: ['Java'],
    });
    expect(matchKeywords(['CI/CD', 'node.js'], 'Owned ci/cd and Node.js services', 'exact').matched).toEqual([
      'CI/CD',
      'node.js',
    ]);
  });

  it('synonym table covers common abbreviations', () => {
    const text = 'JS, TS, AWS, Postgres';
    expect(
      matchKeywords(['JavaScript', 'TypeScript', 'Amazon Web Services', 'PostgreSQL'], text, 'synonym').missing,
    ).toEqual([]);
    expect(matchKeywords(['JavaScript', 'TypeScript', 'Amazon Web Services', 'PostgreSQL'], text, 'stemmed').matched).toEqual(
      [],
    );
  });
});
