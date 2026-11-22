import type { AtsProfile } from '../../types.ts';
import { ALL_DATE_FORMATS } from '../../parse/dates.ts';
import { LENIENT_HEADINGS } from './headings.ts';

export const greenhouse: AtsProfile = {
  id: 'greenhouse',
  name: 'Greenhouse',
  vendor: 'Greenhouse Software, Inc.',
  note:
    'Greenhouse parses resumes leniently: it handles columns and tables and reads headers. It does not give applicants an automatic score; recruiters review candidates and search the resume text for keywords, so the match shown here is a keyword search match, not a ranking.',
  basis:
    'Greenhouse Recruiting support articles (resume parsing, candidate search, no automated resume scoring by default) and recruiter accounts of keyword search in Greenhouse.',
  parser: {
    readsHeaderFooter: true,
    handlesColumns: true,
    handlesTables: true,
    readsTextBoxes: true,
    preferredFormats: ['pdf', 'docx', 'txt'],
  },
  headings: LENIENT_HEADINGS,
  dateFormats: ALL_DATE_FORMATS,
  keywordMode: 'synonym',
  scoring: 'search-match',
  weights: { keywords: 0.5, completeness: 0.3, formatting: 0.2 },
};
