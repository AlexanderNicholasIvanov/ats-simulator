import type { AtsProfile } from '../../types.ts';
import { ALL_DATE_FORMATS } from '../../parse/dates.ts';
import { LENIENT_HEADINGS } from './headings.ts';

export const lever: AtsProfile = {
  id: 'lever',
  name: 'Lever',
  vendor: 'Lever (Employ Inc.)',
  note:
    'Lever reads resumes leniently, including multi-column layouts and headers. It does not auto-score applicants; recruiters search and filter on resume text, so the match shown here is a keyword search match. Text boxes are the one layout element that can still be lost.',
  basis:
    'Lever help center articles on resume parsing and candidate search, plus recruiter guidance that Lever relies on search rather than automatic ranking.',
  parser: {
    readsHeaderFooter: true,
    handlesColumns: true,
    handlesTables: true,
    readsTextBoxes: false,
    preferredFormats: ['pdf', 'docx', 'txt'],
  },
  headings: LENIENT_HEADINGS,
  dateFormats: ALL_DATE_FORMATS,
  keywordMode: 'synonym',
  scoring: 'search-match',
  weights: { keywords: 0.5, completeness: 0.3, formatting: 0.2 },
};
