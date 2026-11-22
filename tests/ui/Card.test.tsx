import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ResultCard } from '../../src/ui/ResultCard.tsx';
import { fakeProfiles, makeResult } from './fixtures.ts';

const workday = fakeProfiles[0];
const greenhouse = fakeProfiles.find((p) => p.id === 'greenhouse')!;

describe('ResultCard', () => {
  it('shows a 0-100 match score for scoring profiles', () => {
    render(<ResultCard result={makeResult(workday, 0)} profile={workday} onOpen={() => {}} />);
    const card = screen.getByRole('article', { name: 'Workday' });
    expect(within(card).getByText('Match score')).toBeInTheDocument();
    expect(within(card).getByText('90')).toBeInTheDocument();
    expect(within(card).getByText(/\/100/)).toBeInTheDocument();
  });

  it('search-match profiles show "Not scored by this ATS" and the % (criterion 9)', () => {
    const result = makeResult(greenhouse, 3);
    render(<ResultCard result={result} profile={greenhouse} onOpen={() => {}} />);
    const card = screen.getByRole('article', { name: 'Greenhouse' });
    expect(within(card).getByText(/Not scored by this ATS/)).toBeInTheDocument();
    expect(within(card).getByText('67%')).toBeInTheDocument();
    expect(within(card).queryByText('Match score')).not.toBeInTheDocument();
    expect(within(card).queryByText(/\/100/)).not.toBeInTheDocument();
  });

  it('without a job description says "Add a job description to score" (criterion 10)', () => {
    const result = makeResult(workday, 0, false);
    render(<ResultCard result={result} profile={workday} onOpen={() => {}} />);
    const card = screen.getByRole('article', { name: 'Workday' });
    expect(within(card).getByText('Add a job description to score')).toBeInTheDocument();
    // parse results and warnings are still shown
    expect(within(card).getByText('Casey Example')).toBeInTheDocument();
    expect(within(card).getByText('Contact details in the header.')).toBeInTheDocument();
    expect(within(card).queryByText(/Matched keywords/)).not.toBeInTheDocument();
  });

  it('search-match profile without a job description also asks for one', () => {
    const result = makeResult(greenhouse, 3, false);
    render(<ResultCard result={result} profile={greenhouse} onOpen={() => {}} />);
    expect(screen.getByText('Add a job description to score')).toBeInTheDocument();
  });

  it('shows parsed fields with "Not found" for missing ones', () => {
    const result = makeResult(workday, 1); // odd index: no location
    render(<ResultCard result={result} profile={workday} onOpen={() => {}} />);
    expect(screen.getByText('casey@example.com')).toBeInTheDocument();
    expect(screen.getByText('Location').nextElementSibling).toHaveTextContent(/^Not found$/);
    expect(screen.getByText('Links').nextElementSibling).toHaveTextContent(/^Not found$/);
    expect(screen.getAllByText('Not found')).toHaveLength(2);
    expect(screen.getByText('BSc Computer Science, Example University')).toBeInTheDocument();
  });

  it('shows the first contact link and how many more there are', () => {
    const base = makeResult(workday, 0);
    const result = {
      ...base,
      parsed: {
        ...base.parsed,
        contact: { ...base.parsed.contact, links: ['linkedin.com/in/casey-example', 'github.com/casey-example'] },
      },
    };
    render(<ResultCard result={result} profile={workday} onOpen={() => {}} />);
    expect(screen.getByText('Links').nextElementSibling).toHaveTextContent('linkedin.com/in/casey-example (+1 more)');
  });

  it('has an expandable "Raw text as this ATS sees it" panel with the raw text of this profile', () => {
    render(<ResultCard result={makeResult(workday, 0)} profile={workday} onOpen={() => {}} />);
    const card = screen.getByRole('article', { name: 'Workday' });
    const summary = within(card).getByText('Raw text as this ATS sees it');
    expect(summary.tagName).toBe('SUMMARY');
    const details = summary.closest('details')!;
    expect(details.open).toBe(false);
    expect(details.querySelector('pre')).toHaveTextContent('Raw text for Workday');
  });

  it('caps keyword chips at 8 with "+N more"', () => {
    render(<ResultCard result={makeResult(workday, 0)} profile={workday} onOpen={() => {}} />);
    const matched = screen.getByText(/Matched keywords/).parentElement!;
    const chips = within(matched).getAllByRole('listitem');
    expect(chips).toHaveLength(9);
    expect(chips[8]).toHaveTextContent('+2 more');
  });

  it('renders repeated keywords without duplicate React keys', () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    const result = { ...makeResult(workday, 0), matched: ['react', 'react'] };
    render(<ResultCard result={result} profile={workday} onOpen={() => {}} />);
    expect(screen.getAllByText('react')).toHaveLength(2);
    expect(errors).not.toHaveBeenCalled();
    errors.mockRestore();
  });

  it('labels each warning with its severity word, not colour alone', () => {
    render(<ResultCard result={makeResult(workday, 0)} profile={workday} onOpen={() => {}} />);
    expect(screen.getByText('Error:')).toBeInTheDocument();
    expect(screen.getByText('Warning:')).toBeInTheDocument();
    expect(screen.getByText('Info:')).toBeInTheDocument();
  });

  it('shows the profile note and a details button that calls onOpen', () => {
    const onOpen = vi.fn();
    render(<ResultCard result={makeResult(workday, 0)} profile={workday} onOpen={onOpen} />);
    expect(screen.getByText(workday.note)).toBeInTheDocument();
    screen.getByRole('button', { name: 'View details for Workday' }).click();
    expect(onOpen).toHaveBeenCalledWith('workday');
  });
});
