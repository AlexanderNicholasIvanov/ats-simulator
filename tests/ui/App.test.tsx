import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../../src/App.tsx';
import { simulateAll } from '../../src/ats/index.ts';
import { extractFile, extractPlainText } from '../../src/extract/index.ts';
import { SAMPLE_JD, SAMPLE_RESUME_TEXT } from '../../src/sample/index.ts';
import { ExtractError } from '../../src/types.ts';
import { fakeDoc, fakeResults } from './fixtures.ts';
import { renderSimulated } from './helpers.tsx';

vi.mock('../../src/ats/index.ts', async () => (await import('./mocks.ts')).atsModule);
vi.mock('../../src/extract/index.ts', async () => (await import('./mocks.ts')).extractModule);

const DISCLAIMER =
  'Simulations are approximations built from public documentation and common recruiter knowledge; not affiliated with or endorsed by any ATS vendor.';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('App input view (criterion 1)', () => {
  it('renders the labelled input controls and the exact disclaimer', () => {
    render(<App />);
    expect(screen.getByRole('heading', { level: 1, name: 'ATS Simulator' })).toBeInTheDocument();
    const fileInput = screen.getByLabelText(/Resume file/);
    expect(fileInput).toHaveAttribute('type', 'file');
    expect(fileInput).toHaveAttribute('accept', '.pdf,.docx,.txt');
    expect(screen.getByLabelText('Or paste resume text')).toBeInTheDocument();
    expect(screen.getByLabelText('Job description')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Load sample' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Simulate' })).toBeDisabled();
    expect(screen.getByText(DISCLAIMER)).toBeInTheDocument();
    expect(
      screen.getByText('Runs entirely in your browser - your resume is never uploaded.'),
    ).toBeInTheDocument();
  });

  it('enables Simulate once resume text is typed', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.type(screen.getByLabelText('Or paste resume text'), 'Casey');
    expect(screen.getByRole('button', { name: 'Simulate' })).toBeEnabled();
  });
});

function fileDropEvent(type: 'dragover' | 'drop'): Event {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'dataTransfer', { value: { types: ['Files'], files: [] } });
  return event;
}

describe('drops outside the drop zone', () => {
  it('are blocked at window level so the tab does not navigate, and unblocked on unmount', () => {
    const { unmount } = render(<App />);
    for (const type of ['dragover', 'drop'] as const) {
      const event = fileDropEvent(type);
      window.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(true);
    }
    unmount();
    const after = fileDropEvent('drop');
    window.dispatchEvent(after);
    expect(after.defaultPrevented).toBe(false);
  });
});

describe('rejected files (criterion 4)', () => {
  it('shows the ExtractError message in an alert and renders no cards', async () => {
    vi.mocked(extractFile).mockRejectedValueOnce(
      new ExtractError('unsupported-type', 'Unsupported file type: .png. Use PDF, DOCX or TXT.'),
    );
    // applyAccept: false so the .png reaches the app, as a drag-and-drop would.
    const user = userEvent.setup({ applyAccept: false });
    render(<App />);
    const png = new File(['not an image really'], 'photo.png', { type: 'image/png' });
    await user.upload(screen.getByLabelText(/Resume file/), png);
    await user.click(screen.getByRole('button', { name: 'Simulate' }));

    expect(await screen.findByText('Unsupported file type: .png. Use PDF, DOCX or TXT.')).toBe(
      screen.getByRole('alert'),
    );
    expect(extractFile).toHaveBeenCalledWith(png);
    expect(simulateAll).not.toHaveBeenCalled();
    expect(screen.queryAllByRole('article')).toHaveLength(0);
    expect(screen.getByRole('alert')).toHaveFocus();
  });

  it('clears a stale error when a new file is chosen or the text is edited', async () => {
    vi.mocked(extractFile).mockRejectedValue(new ExtractError('corrupt', 'Could not read file.'));
    const user = userEvent.setup();
    render(<App />);
    const input = screen.getByLabelText(/Resume file/);
    await user.upload(input, new File(['x'], 'a.pdf', { type: 'application/pdf' }));
    await user.click(screen.getByRole('button', { name: 'Simulate' }));
    expect(await screen.findByText('Could not read file.')).toBeInTheDocument();

    await user.upload(input, new File(['y'], 'b.pdf', { type: 'application/pdf' }));
    expect(screen.getByRole('alert')).toBeEmptyDOMElement();

    await user.click(screen.getByRole('button', { name: 'Simulate' }));
    expect(await screen.findByText('Could not read file.')).toBeInTheDocument();
    await user.type(screen.getByLabelText('Job description'), 'R');
    expect(screen.getByRole('alert')).toBeEmptyDOMElement();
    vi.mocked(extractFile).mockReset();
  });

  it('shows a busy state while extracting', async () => {
    let resolve: (doc: typeof fakeDoc) => void = () => {};
    vi.mocked(extractFile).mockReturnValueOnce(
      new Promise((r) => {
        resolve = r;
      }),
    );
    const user = userEvent.setup();
    render(<App />);
    await user.upload(
      screen.getByLabelText(/Resume file/),
      new File(['Casey'], 'resume.txt', { type: 'text/plain' }),
    );
    await user.click(screen.getByRole('button', { name: 'Simulate' }));
    const busy = screen.getByRole('button', { name: 'Simulating...' });
    expect(busy).toBeDisabled();
    expect(screen.getByRole('region', { name: 'Your resume and the job' })).toHaveAttribute(
      'aria-busy',
      'true',
    );
    // inputs are locked so the results cannot belong to a different file than the one shown
    expect(screen.getByLabelText(/Resume file/)).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Clear file' })).toBeDisabled();
    expect(screen.getByLabelText('Or paste resume text')).toBeDisabled();
    expect(screen.getByLabelText('Job description')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Load sample' })).toBeDisabled();
    expect(screen.getByRole('status')).toHaveTextContent('Simulating...');
    resolve(fakeDoc);
    expect(await screen.findAllByRole('article')).toHaveLength(8);
  });
});

describe('results (criterion 5, UI part)', () => {
  it('Load sample + Simulate renders 8 cards and a ranking in rankResults order', async () => {
    await renderSimulated();
    expect(extractPlainText).toHaveBeenCalledWith(SAMPLE_RESUME_TEXT);
    expect(simulateAll).toHaveBeenCalledWith(fakeDoc, SAMPLE_JD);

    const articles = screen.getAllByRole('article');
    expect(articles.map((a) => within(a).getByRole('heading', { level: 3 }).textContent)).toEqual(
      fakeResults.map((r) => r.profileName),
    );
    for (const article of articles) {
      expect(within(article).getByText('Parsed fields')).toBeInTheDocument();
      expect(within(article).getByText('Score')).toBeInTheDocument();
      expect(within(article).getByText('Warnings')).toBeInTheDocument();
    }

    const ranking = screen.getByRole('list', { name: 'Ranking' });
    const items = within(ranking).getAllByRole('listitem');
    expect(items).toHaveLength(8);
    const reversed = [...fakeResults].reverse();
    items.forEach((item, i) => {
      expect(item).toHaveTextContent(reversed[i].profileName);
    });
    expect(items[0]).toHaveTextContent('Jobvite 55/100');
    expect(within(ranking).getByText('search match 66%')).toBeInTheDocument();
  });

  it('moves focus to the Results heading and announces the results', async () => {
    await renderSimulated();
    expect(screen.getByRole('heading', { level: 2, name: 'Results' })).toHaveFocus();
    expect(screen.getByRole('status')).toHaveTextContent('8 results ready');
  });

  it('Load sample clears a chosen file', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.upload(
      screen.getByLabelText(/Resume file/),
      new File(['Casey'], 'resume.txt', { type: 'text/plain' }),
    );
    expect(screen.getByText('resume.txt')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Load sample' }));
    expect(screen.queryByText('resume.txt')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Or paste resume text')).toHaveValue(SAMPLE_RESUME_TEXT);
    expect(screen.getByLabelText('Job description')).toHaveValue(SAMPLE_JD);
  });
});
