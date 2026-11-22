import type { AtsProfile } from '../../types.ts';
import { STRICT_HEADINGS } from './headings.ts';

export const icims: AtsProfile = {
  id: 'icims',
  name: 'iCIMS',
  vendor: 'iCIMS, Inc.',
  note:
    'iCIMS parses resumes into candidate profiles and ranks them against the job. It does not read page headers or multi-column layouts and has trouble with tables, so keep everything in one column of plain text. It matches simple word-form variants of keywords.',
  basis:
    'iCIMS Talent Cloud documentation on resume parsing and candidate ranking, plus common recruiter guidance (avoid headers, columns and tables; use standard headings).',
  parser: {
    readsHeaderFooter: false,
    handlesColumns: false,
    handlesTables: false,
    readsTextBoxes: false,
    preferredFormats: ['docx', 'pdf', 'txt'],
  },
  headings: STRICT_HEADINGS,
  dateFormats: ['Mon YYYY', 'Month YYYY', 'MM/YYYY', 'YYYY'],
  keywordMode: 'stemmed',
  scoring: 'score',
  weights: { keywords: 0.55, completeness: 0.25, formatting: 0.2 },
};
