import type { AtsProfile } from '../../types.ts';
import { STRICT_HEADINGS } from './headings.ts';

export const successfactors: AtsProfile = {
  id: 'successfactors',
  name: 'SAP SuccessFactors',
  vendor: 'SAP SE',
  note:
    'SAP SuccessFactors Recruiting uses a strict parser: headers, footers, columns, tables and text boxes are not read reliably, only classic headings are recognised and keyword matching is literal. Simple, single-column documents with standard dates parse best.',
  basis:
    'SAP SuccessFactors Recruiting documentation on resume parsing configuration, plus common recruiter guidance on keeping resumes simple and single-column.',
  parser: {
    readsHeaderFooter: false,
    handlesColumns: false,
    handlesTables: false,
    readsTextBoxes: false,
    preferredFormats: ['docx', 'pdf', 'txt'],
  },
  headings: STRICT_HEADINGS,
  dateFormats: ['Mon YYYY', 'Month YYYY', 'MM/YYYY', 'YYYY'],
  keywordMode: 'exact',
  scoring: 'score',
  weights: { keywords: 0.55, completeness: 0.3, formatting: 0.15 },
};
