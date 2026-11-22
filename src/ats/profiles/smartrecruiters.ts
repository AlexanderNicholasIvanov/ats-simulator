import type { AtsProfile } from '../../types.ts';
import { MODERATE_HEADINGS } from './headings.ts';

export const smartrecruiters: AtsProfile = {
  id: 'smartrecruiters',
  name: 'SmartRecruiters',
  vendor: 'SmartRecruiters, Inc.',
  note:
    'SmartRecruiters parses moderately well: it reads headers and tables but flattens multi-column layouts and skips text boxes. It scores candidates against the job and tolerates simple word-form changes in keywords. Common heading variants are recognised.',
  basis:
    'SmartRecruiters help center articles on resume parsing and candidate matching, plus recruiter guidance on single-column layouts.',
  parser: {
    readsHeaderFooter: true,
    handlesColumns: false,
    handlesTables: true,
    readsTextBoxes: false,
    preferredFormats: ['pdf', 'docx', 'txt'],
  },
  headings: MODERATE_HEADINGS,
  dateFormats: ['Mon YYYY', 'Month YYYY', 'MM/YYYY', 'MM-YYYY', 'YYYY'],
  keywordMode: 'stemmed',
  scoring: 'score',
  weights: { keywords: 0.5, completeness: 0.3, formatting: 0.2 },
};
