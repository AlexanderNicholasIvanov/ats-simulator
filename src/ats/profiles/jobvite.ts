import type { AtsProfile } from '../../types.ts';
import { MODERATE_HEADINGS } from './headings.ts';

export const jobvite: AtsProfile = {
  id: 'jobvite',
  name: 'Jobvite',
  vendor: 'Jobvite (Employ Inc.)',
  note:
    'Jobvite parses moderately well: tables are read, but page headers and footers, multi-column layouts and text boxes are not. It scores candidates against the job and tolerates simple word-form changes in keywords. Common heading variants are recognised.',
  basis:
    'Jobvite support documentation on resume parsing and candidate match scoring, plus common recruiter guidance on headers and columns.',
  parser: {
    readsHeaderFooter: false,
    handlesColumns: false,
    handlesTables: true,
    readsTextBoxes: false,
    preferredFormats: ['docx', 'pdf', 'txt'],
  },
  headings: MODERATE_HEADINGS,
  dateFormats: ['Mon YYYY', 'Month YYYY', 'MM/YYYY', 'MM-YYYY', 'YYYY-MM', 'YYYY'],
  keywordMode: 'stemmed',
  scoring: 'score',
  weights: { keywords: 0.5, completeness: 0.3, formatting: 0.2 },
};
