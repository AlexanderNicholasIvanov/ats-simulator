import { screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderSimulated } from './helpers.tsx';

vi.mock('../../src/ats/index.ts', async () => (await import('./mocks.ts')).atsModule);
vi.mock('../../src/extract/index.ts', async () => (await import('./mocks.ts')).extractModule);

describe('detail view (criterion 17)', () => {
  it('opens with Enter on the focused button and Escape returns focus to it', async () => {
    const { user } = await renderSimulated();
    const button = screen.getByRole('button', { name: 'View details for Workday' });
    button.focus();
    expect(button).toHaveFocus();
    await user.keyboard('{Enter}');

    // grid replaced by the detail view
    expect(screen.queryAllByRole('article')).toHaveLength(0);
    expect(screen.getByRole('heading', { name: /Workday: full details/ })).toBeInTheDocument();

    const table = screen.getByRole('table');
    expect(within(table).getByText('Casey Example')).toBeInTheDocument();
    expect(within(table).getByText('Software Engineer')).toBeInTheDocument();
    expect(within(table).getByText('Example Corp')).toBeInTheDocument();
    expect(within(table).getByText('2020-01')).toBeInTheDocument();
    expect(within(table).getByText('present')).toBeInTheDocument();
    expect(within(table).getByText('Junior Developer')).toBeInTheDocument();
    expect(within(table).getByText('React, TypeScript, Testing')).toBeInTheDocument();

    // full keyword lists, no "+N more"
    expect(screen.getByText('Matched keywords (10)')).toBeInTheDocument();
    expect(screen.getByText('node')).toBeInTheDocument();
    expect(screen.getByText('Missing keywords (2)')).toBeInTheDocument();
    expect(screen.getByText('kubernetes')).toBeInTheDocument();
    expect(screen.queryByText(/more$/)).not.toBeInTheDocument();

    const summary = screen.getByText('Raw text as this ATS sees it');
    expect(summary.tagName).toBe('SUMMARY');
    expect(summary.closest('details')!.querySelector('pre')).toHaveTextContent(
      'Raw text for Workday',
    );

    await user.keyboard('{Escape}');
    expect(screen.getAllByRole('article')).toHaveLength(8);
    expect(screen.getByRole('button', { name: 'View details for Workday' })).toHaveFocus();
  });

  it('"Back to all results" returns to the grid and restores focus', async () => {
    const { user } = await renderSimulated();
    await user.click(screen.getByRole('button', { name: 'View details for Lever' }));
    expect(screen.getByText(/Not scored by this ATS/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Back to all results' }));
    expect(screen.getAllByRole('article')).toHaveLength(8);
    expect(screen.getByRole('button', { name: 'View details for Lever' })).toHaveFocus();
  });
});
