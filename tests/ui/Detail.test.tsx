import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DetailView } from '../../src/ui/DetailView.tsx';
import { fakeProfiles, makeResult } from './fixtures.ts';
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

  it('opens with Space on the focused button', async () => {
    const { user } = await renderSimulated();
    const button = screen.getByRole('button', { name: 'View details for Oracle Taleo' });
    button.focus();
    await user.keyboard(' ');
    expect(screen.queryAllByRole('article')).toHaveLength(0);
    expect(screen.getByRole('heading', { name: /Oracle Taleo: full details/ })).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(screen.getByRole('button', { name: 'View details for Oracle Taleo' })).toHaveFocus();
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

describe('detail view Escape handling', () => {
  function renderWithFields() {
    const onClose = vi.fn();
    render(
      <>
        <label>
          Notes
          <textarea />
        </label>
        <label>
          Search
          <input type="text" />
        </label>
        <label>
          Pick
          <select>
            <option>One</option>
          </select>
        </label>
        <div contentEditable suppressContentEditableWarning data-testid="editable">
          <span data-testid="editable-child">editable</span>
        </div>
        <DetailView result={makeResult(fakeProfiles[0], 0)} profile={fakeProfiles[0]} onClose={onClose} />
      </>,
    );
    return onClose;
  }

  it('ignores Escape typed in a textarea, input, select or contentEditable element', () => {
    const onClose = renderWithFields();
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Notes' }), { key: 'Escape' });
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Search' }), { key: 'Escape' });
    fireEvent.keyDown(screen.getByRole('combobox', { name: 'Pick' }), { key: 'Escape' });
    fireEvent.keyDown(screen.getByTestId('editable'), { key: 'Escape' });
    fireEvent.keyDown(screen.getByTestId('editable-child'), { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
  });

  it('ignores Escape while an IME composition is active', () => {
    const onClose = renderWithFields();
    fireEvent.keyDown(document.body, { key: 'Escape', isComposing: true });
    expect(onClose).not.toHaveBeenCalled();
  });

  it('still closes on Escape elsewhere', () => {
    const onClose = renderWithFields();
    fireEvent.keyDown(screen.getByRole('heading', { name: /full details/ }), { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
