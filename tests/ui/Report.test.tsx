import { screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildReport } from '../../src/ats/index.ts';
import type { Report } from '../../src/types.ts';
import { fakeResults } from './fixtures.ts';
import { renderSimulated } from './helpers.tsx';

vi.mock('../../src/ats/index.ts', async () => (await import('./mocks.ts')).atsModule);
vi.mock('../../src/extract/index.ts', async () => (await import('./mocks.ts')).extractModule);

// jsdom does not implement these; install stubs per test and put the originals back afterwards.
const original = { create: URL.createObjectURL, revoke: URL.revokeObjectURL };

afterEach(() => {
  vi.restoreAllMocks();
  URL.createObjectURL = original.create;
  URL.revokeObjectURL = original.revoke;
});

describe('Download report (criterion 13, UI part)', () => {
  it('creates a JSON blob with one entry per profile and downloads it', async () => {
    const createObjectURL = vi.fn((_blob: Blob) => 'blob:ats-report');
    const revokeObjectURL = vi.fn();
    URL.createObjectURL = createObjectURL;
    URL.revokeObjectURL = revokeObjectURL;
    const clicked: HTMLAnchorElement[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      clicked.push(this);
    });

    const { user } = await renderSimulated();
    await user.click(screen.getByRole('button', { name: 'Download report' }));

    expect(buildReport).toHaveBeenCalledWith('pasted-text.txt', fakeResults);
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    const blob = createObjectURL.mock.calls[0][0];
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe('application/json');
    const report = JSON.parse(await blob.text()) as Report;
    expect(report.results).toHaveLength(8);
    expect(report.results.map((r) => r.profileId)).toEqual(fakeResults.map((r) => r.profileId));

    expect(clicked).toHaveLength(1);
    expect(clicked[0].download).toBe('ats-simulation-report.json');
    expect(clicked[0].getAttribute('href')).toBe('blob:ats-report');
    expect(clicked[0].isConnected).toBe(false);
    await waitFor(() => expect(revokeObjectURL).toHaveBeenCalledWith('blob:ats-report'));
  });
});
