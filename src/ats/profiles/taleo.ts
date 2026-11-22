import type { AtsProfile } from '../../types.ts';
import { STRICT_HEADINGS } from './headings.ts';

export const taleo: AtsProfile = {
  id: 'taleo',
  name: 'Oracle Taleo',
  vendor: 'Oracle Corporation',
  note:
    'Taleo is one of the oldest and strictest parsers. It expects a plain single-column document: columns, tables, headers, footers and text boxes are dropped or scrambled. Only classic section headings are recognised, keyword matching is literal (no word-form or synonym tolerance) and only numeric dates parse reliably.',
  basis:
    'Oracle Taleo Recruiting documentation on resume parsing and candidate selection, plus long-standing recruiter guidance on its literal keyword matching and its trouble with tables, columns and headers.',
  parser: {
    readsHeaderFooter: false,
    handlesColumns: false,
    handlesTables: false,
    readsTextBoxes: false,
    preferredFormats: ['docx', 'txt'],
  },
  headings: STRICT_HEADINGS,
  dateFormats: ['MM/YYYY', 'YYYY'],
  keywordMode: 'exact',
  scoring: 'score',
  weights: { keywords: 0.6, completeness: 0.25, formatting: 0.15 },
};
