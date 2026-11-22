import type { AtsProfile } from '../../types.ts';
import { STRICT_HEADINGS } from './headings.ts';

export const workday: AtsProfile = {
  id: 'workday',
  name: 'Workday',
  vendor: 'Workday, Inc.',
  note:
    'Workday Recruiting parses the resume into its own application form. It reads the main body well but skips page headers and footers, flattens multi-column layouts and ignores text boxes, so contact details or skills placed there often go missing. Keyword matching tolerates simple word-form changes. Month-name and numeric dates parse best.',
  basis:
    'Workday Recruiting help articles on resume parsing and application autofill, plus widely shared recruiter and career-coach guidance (single column, no headers/footers, standard headings, Mon YYYY or MM/YYYY dates).',
  parser: {
    readsHeaderFooter: false,
    handlesColumns: false,
    handlesTables: true,
    readsTextBoxes: false,
    preferredFormats: ['docx', 'pdf', 'txt'],
  },
  headings: STRICT_HEADINGS,
  dateFormats: ['Mon YYYY', 'MM/YYYY', 'YYYY'],
  keywordMode: 'stemmed',
  scoring: 'score',
  weights: { keywords: 0.5, completeness: 0.3, formatting: 0.2 },
};
