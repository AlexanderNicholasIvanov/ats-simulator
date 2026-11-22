import { render, screen } from '@testing-library/react';
import axe from 'axe-core';
import { describe, expect, it, vi } from 'vitest';
import App from '../../src/App.tsx';
import { renderSimulated } from './helpers.tsx';

vi.mock('../../src/ats/index.ts', async () => (await import('./mocks.ts')).atsModule);
vi.mock('../../src/extract/index.ts', async () => (await import('./mocks.ts')).extractModule);

// jsdom has no layout or computed colours, so axe cannot evaluate contrast; that one rule is off.
const AXE_OPTIONS: axe.RunOptions = { rules: { 'color-contrast': { enabled: false } } };

async function violations(container: Element) {
  const result = await axe.run(container, AXE_OPTIONS);
  return result.violations.map((v) => `${v.id}: ${v.help} (${v.nodes.length} nodes)`);
}

describe('accessibility (criterion 15)', () => {
  it('input view has no axe violations', async () => {
    const { container } = render(<App />);
    expect(await violations(container)).toEqual([]);
  });

  it('results view has no axe violations', async () => {
    const { container } = await renderSimulated();
    expect(await violations(container)).toEqual([]);
  });

  it('detail view has no axe violations', async () => {
    const { container, user } = await renderSimulated();
    await user.click(screen.getByRole('button', { name: 'View details for Workday' }));
    expect(await violations(container)).toEqual([]);
  });
});
