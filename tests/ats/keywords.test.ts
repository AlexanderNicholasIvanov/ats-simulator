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

describe('finding 6: ordinary words, short language terms, go-to, docker', () => {
  it('keeps only real skills from ordinary prose', () => {
    expect(extractKeywords('We use Go and C. Let us go to the moon. Requires R and Excel.')).toEqual([
      'Go',
      'C',
      'R',
      'Excel',
    ]);
  });

  it('drops common verbs and one-off ordinary words', () => {
    const kws = extractKeywords('Join us! You will work with people, use tools and love it. Looking for Python.');
    expect(kws).toEqual(['Python']);
  });

  it('ignores short terms in the wrong casing or outside a list context', () => {
    expect(extractKeywords('Please go ahead and apply.')).toEqual([]);
    expect(extractKeywords('Plan C is our backup.')).toEqual([]);
  });

  it("exact mode does not match 'go' inside 'go-to' or short terms in other casing", () => {
    expect(matchKeywords(['Go'], 'My go-to stack is Rust.', 'exact').matched).toEqual([]);
    expect(matchKeywords(['Go'], "Let's go ship it", 'synonym').matched).toEqual([]);
    expect(matchKeywords(['Go'], 'Services in Go and Rust', 'exact').matched).toEqual(['Go']);
    expect(matchKeywords(['C'], 'Wrote firmware in C, C++', 'exact').matched).toEqual(['C']);
  });

  it("the stemmer keeps 'docker' apart from 'docking'", () => {
    expect(stem('docker')).not.toBe(stem('docking'));
    expect(matchKeywords(['Docker'], 'Built a docking station app', 'stemmed').matched).toEqual([]);
    expect(matchKeywords(['Docker'], 'Containerised services with Docker', 'stemmed').matched).toEqual(['Docker']);
  });
});
