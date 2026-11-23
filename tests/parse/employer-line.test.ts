import { describe, expect, it } from 'vitest';
import { LENIENT_HEADINGS, STRICT_HEADINGS } from '../../src/ats/profiles/headings.ts';
import { ALL_DATE_FORMATS, parseResume } from '../../src/parse/index.ts';

// 'Title    Dates' then 'Employer    Location' (location right-aligned, no comma)
const TEXT = [
  'Casey Morgan',
  'casey.morgan@example.com | 555-010-7788 | Denver, CO',
  'EXPERIENCE',
  'Software Engineer II May 2024 – Present',
  'Acme Corp Colorado',
  '• Built ETL pipelines.',
  'Software Engineer I June 2023 – May 2024',
  'Acme Corp Colorado',
  '• Wrote design documents.',
  'Software Developer May 2021 – June 2023',
  'Paradigm Labs Maryland',
  '• Built exam features.',
  'EDUCATION',
  'University of Somewhere',
  'B.S. in Computer Science',
].join('\n');

describe('employer + location line under a job header', () => {
  for (const [name, headings] of [['lenient', LENIENT_HEADINGS], ['strict', STRICT_HEADINGS]] as const) {
    it(`is not taken for a section heading (${name})`, () => {
      const r = parseResume(TEXT, { headings, dateFormats: ALL_DATE_FORMATS });
      expect(r.sections.filter((s) => !s.recognized).map((s) => s.heading)).toEqual([]);
      expect(r.experience).toHaveLength(3);
      expect(r.experience.map((j) => j.title)).toEqual(['Software Engineer II', 'Software Engineer I', 'Software Developer']);
    });
  }
});
