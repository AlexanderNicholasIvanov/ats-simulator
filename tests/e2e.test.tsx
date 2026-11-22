// End-to-end tests with the real extract, parse and ATS modules (no mocks).
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import App from '../src/App.tsx';
import { PROFILES, simulateAll } from '../src/ats/index.ts';
import { extractFile } from '../src/extract/index.ts';
import { SAMPLE_JD } from '../src/sample/index.ts';
import { fixtureFile } from './extract/helpers.ts';

describe('end to end (criteria 3, 5, 7)', () => {
  it('Load sample + Simulate renders 8 real cards and an 8-entry ranking', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Load sample' }));
    await user.click(screen.getByRole('button', { name: 'Simulate' }));

    const cards = await screen.findAllByRole('article');
    expect(cards).toHaveLength(8);
    expect(cards.map((c) => within(c).getByRole('heading', { level: 3 }).textContent)).toEqual(
      PROFILES.map((p) => p.name),
    );
    const ranking = screen.getByRole('list', { name: 'Ranking' });
    expect(within(ranking).getAllByRole('listitem')).toHaveLength(8);
    // Lever and Greenhouse are not auto-scored.
    const lever = cards.find((c) => within(c).queryByRole('heading', { level: 3, name: 'Lever' }));
    expect(lever).toBeDefined();
    expect(within(lever!).getByText(/Not scored by this ATS/)).toBeInTheDocument();
  });

  it('the two-column PDF fixture loses fields on strict profiles but not on lenient ones', async () => {
    const doc = await extractFile(fixtureFile('resume-two-column.pdf'));
    expect(doc.layout.columns).toBe(2);
    const byId = new Map(simulateAll(doc, SAMPLE_JD).map((r) => [r.profileId, r]));
    const lenientMin = Math.min(byId.get('greenhouse')!.fieldsFound, byId.get('lever')!.fieldsFound);
    for (const id of ['taleo', 'icims', 'workday']) {
      const r = byId.get(id)!;
      expect(r.warnings.some((w) => w.code === 'two-column')).toBe(true);
      expect(r.fieldsFound).toBeLessThan(lenientMin);
    }
  });

  it('the image-only PDF gives a no-text error on every profile', async () => {
    const doc = await extractFile(fixtureFile('resume-image-only.pdf'));
    for (const r of simulateAll(doc, SAMPLE_JD)) {
      expect(r.warnings).toHaveLength(1);
      expect(r.warnings[0]).toMatchObject({ code: 'no-text', severity: 'error' });
    }
  });

  it('header contact info is lost on strict profiles and kept on Greenhouse', async () => {
    const doc = await extractFile(fixtureFile('resume-header-contact.pdf'));
    const byId = new Map(simulateAll(doc, SAMPLE_JD).map((r) => [r.profileId, r]));
    expect(byId.get('taleo')!.parsed.contact.email).toBeUndefined();
    expect(byId.get('taleo')!.warnings.some((w) => w.code === 'header-contact')).toBe(true);
    expect(byId.get('greenhouse')!.parsed.contact.email).toBeTruthy();
  });
});
