import { describe, expect, it } from 'vitest';
import { PROFILES, simulate } from '../../src/ats/index.ts';
import { headerContactDoc, twoColumnDoc } from './helpers.ts';

const byId = (id: string) => {
  const p = PROFILES.find((x) => x.id === id);
  if (!p) throw new Error(`no profile ${id}`);
  return p;
};
const STRICT = ['taleo', 'icims', 'workday'];
const LENIENT = ['greenhouse', 'lever'];

describe('profiles differ measurably (criterion 7)', () => {
  it('two-column resume: strict profiles warn and find strictly fewer fields than lenient ones', () => {
    const doc = twoColumnDoc();
    const strict = STRICT.map((id) => simulate(doc, undefined, byId(id)));
    const lenient = LENIENT.map((id) => simulate(doc, undefined, byId(id)));

    for (const r of strict) {
      const w = r.warnings.find((x) => x.code === 'two-column');
      expect(w, r.profileId).toBeDefined();
      expect(w?.severity).toBe('warning');
    }
    for (const r of lenient) {
      expect(r.warnings.map((x) => x.code)).not.toContain('two-column');
      expect(r.fieldsFound).toBe(7);
    }
    const bestStrict = Math.max(...strict.map((r) => r.fieldsFound));
    const worstLenient = Math.min(...lenient.map((r) => r.fieldsFound));
    expect(bestStrict).toBeLessThan(worstLenient);
  });

  it('two-column resume: the strict parser view interleaves the columns', () => {
    const r = simulate(twoColumnDoc(), undefined, byId('taleo'));
    expect(r.rawText.split('\n').slice(0, 3)).toEqual(['Jordan Rivera', 'Summary', 'Austin, TX']);
    const g = simulate(twoColumnDoc(), undefined, byId('greenhouse'));
    expect(g.rawText.split('\n').slice(0, 3)).toEqual(['Jordan Rivera', 'Austin, TX', 'jordan.rivera@example.com']);
  });

  it('contact details in the page header: strict profiles lose the email, Greenhouse keeps it', () => {
    const doc = headerContactDoc();
    for (const id of [...STRICT, 'successfactors']) {
      const r = simulate(doc, undefined, byId(id));
      expect(r.parsed.contact.email, id).toBeUndefined();
      expect(r.warnings).toContainEqual(expect.objectContaining({ code: 'header-contact', severity: 'error' }));
    }
    const g = simulate(doc, undefined, byId('greenhouse'));
    expect(g.parsed.contact.email).toBe('jordan.rivera@example.com');
    expect(g.parsed.contact.phone).toBe('(555) 010-2345');
    expect(g.warnings.map((w) => w.code)).not.toContain('header-contact');
    expect(g.fieldsFound).toBeGreaterThan(simulate(doc, undefined, byId('taleo')).fieldsFound);
  });
});
