import { describe, expect, it } from 'vitest';
import { PROFILES, validateProfile } from '../../src/ats/index.ts';
import type { AtsProfile } from '../../src/types.ts';

describe('PROFILES registry (criterion 11)', () => {
  it('has exactly the 8 default profiles in registry order', () => {
    expect(PROFILES.map((p) => p.id)).toEqual([
      'workday',
      'taleo',
      'icims',
      'greenhouse',
      'lever',
      'successfactors',
      'smartrecruiters',
      'jobvite',
    ]);
    expect(new Set(PROFILES.map((p) => p.id)).size).toBe(8);
  });

  it.each(PROFILES.map((p) => [p.id, p] as const))('%s passes schema validation', (_id, p) => {
    expect(validateProfile(p)).toEqual([]);
  });

  it('marks Greenhouse and Lever as search-match, the rest as score', () => {
    const searchOnly = PROFILES.filter((p) => p.scoring === 'search-match').map((p) => p.id);
    expect(searchOnly).toEqual(['greenhouse', 'lever']);
  });

  it('strict profiles do not read headers or columns; lenient ones do', () => {
    const byId = Object.fromEntries(PROFILES.map((p) => [p.id, p]));
    for (const id of ['taleo', 'icims', 'workday', 'successfactors']) {
      expect(byId[id].parser.readsHeaderFooter).toBe(false);
      expect(byId[id].parser.handlesColumns).toBe(false);
    }
    for (const id of ['greenhouse', 'lever']) {
      expect(byId[id].parser.readsHeaderFooter).toBe(true);
      expect(byId[id].parser.handlesColumns).toBe(true);
    }
    expect(byId.taleo.keywordMode).toBe('exact');
    expect(byId.greenhouse.keywordMode).toBe('synonym');
  });
});

describe('validateProfile', () => {
  const good: AtsProfile = PROFILES[0];

  it('rejects a profile with weights summing to 0.5 and no name', () => {
    const { name: _name, ...rest } = good;
    const broken = { ...rest, weights: { keywords: 0.2, completeness: 0.2, formatting: 0.1 } };
    const errors = validateProfile(broken);
    expect(errors).toContain('name must be a string');
    expect(errors).toContain('weights must sum to 1 (got 0.5)');
  });

  it('rejects bad ids, unknown enums, empty date formats and bad weights', () => {
    const errors = validateProfile({
      ...good,
      id: 'Not Kebab',
      note: '  ',
      dateFormats: [],
      keywordMode: 'fuzzy',
      scoring: 'rank',
      weights: { keywords: 1.5, completeness: -0.5, formatting: 0 },
      parser: { ...good.parser, handlesTables: 'yes', preferredFormats: ['rtf'] },
    });
    expect(errors).toEqual(
      expect.arrayContaining([
        'id "Not Kebab" must be kebab-case',
        'note must not be empty',
        'dateFormats must be a non-empty array',
        'keywordMode must be one of exact, stemmed, synonym',
        "scoring must be 'score' or 'search-match'",
        'weights.keywords must be between 0 and 1',
        'weights.completeness must be between 0 and 1',
        'parser.handlesTables must be a boolean',
        'parser.preferredFormats: unknown format "rtf"',
      ]),
    );
    expect(validateProfile({ ...good, dateFormats: ['DD.MM.YYYY'] })).toEqual([
      'dateFormats: unknown format "DD.MM.YYYY"',
    ]);
  });

  it('rejects non-objects', () => {
    expect(validateProfile(null)).toEqual(['profile must be an object']);
    expect(validateProfile('workday')).toEqual(['profile must be an object']);
  });
});
