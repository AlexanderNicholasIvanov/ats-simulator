import { describe, expect, it } from 'vitest';
import { LENIENT_HEADINGS, STRICT_HEADINGS } from '../../src/ats/profiles/headings.ts';
import { ALL_DATE_FORMATS, parseResume } from '../../src/parse/index.ts';
import { SAMPLE_RESUME_TEXT } from '../../src/sample/index.ts';

const lenient = { headings: LENIENT_HEADINGS, dateFormats: ALL_DATE_FORMATS };

describe('parseResume on the sample resume (criterion 6)', () => {
  const r = parseResume(SAMPLE_RESUME_TEXT, lenient);

  it('extracts contact details', () => {
    expect(r.contact.name).toBe('Jordan Rivera');
    expect(r.contact.email).toBe('jordan.rivera@example.com');
    expect(r.contact.phone).toBe('(555) 010-2345');
    expect(r.contact.location).toBe('Austin, TX');
    expect(r.contact.links).toContain('linkedin.com/in/jordan-rivera-example');
  });

  it('extracts at least 3 jobs, each with title, employer, start and end', () => {
    expect(r.experience.length).toBeGreaterThanOrEqual(3);
    for (const job of r.experience) {
      expect(job.title).toBeTruthy();
      expect(job.employer).toBeTruthy();
      expect(job.start).toBeTruthy();
      expect(job.end).toBeTruthy();
    }
    expect(r.experience[0]).toMatchObject({
      title: 'Senior Software Engineer',
      employer: 'Lonestar Analytics',
      start: '2021-03',
      end: 'present',
    });
    expect(r.experience[1]).toMatchObject({
      title: 'Software Engineer',
      employer: 'Bluebonnet Health',
      start: '2018-06',
      end: '2021-02',
    });
    expect(r.experience[2]).toMatchObject({
      title: 'Junior Web Developer',
      employer: 'Capitol Web Studio',
      start: '2016',
      end: '2018',
    });
  });

  it('extracts education with institution and degree', () => {
    expect(r.education[0]).toEqual({
      institution: 'University of Texas at Austin',
      degree: 'B.S. Computer Science',
      year: '2016',
    });
  });

  it('extracts at least 5 de-duplicated skills', () => {
    expect(r.skills.length).toBeGreaterThanOrEqual(5);
    expect(r.skills).toEqual(expect.arrayContaining(['JavaScript', 'TypeScript', 'React', 'Node.js', 'CI/CD']));
    expect(new Set(r.skills.map((s) => s.toLowerCase())).size).toBe(r.skills.length);
  });

  it('recognises every section and reports no unparsed dates', () => {
    expect(r.sections.map((s) => s.canonical)).toEqual(['summary', 'experience', 'education', 'skills']);
    expect(r.sections.every((s) => s.recognized)).toBe(true);
    expect(r.unparsedDates).toEqual([]);
  });
});

describe('parseResume heuristics', () => {
  it('flags heading-like lines it does not know and ignores their content', () => {
    const text = [
      'Alex Example',
      'Work History',
      'Engineer - Acme Corp',
      '01/2020 - Present',
      'Education',
      'BA History, Example College, 2015',
      'SKILLS',
      'Python; SQL | Excel • Python',
    ].join('\n');
    const strict = parseResume(text, { headings: STRICT_HEADINGS, dateFormats: ALL_DATE_FORMATS });
    expect(strict.sections[0]).toEqual({ heading: 'Work History', recognized: false });
    expect(strict.experience).toEqual([]);
    expect(strict.skills).toEqual(['Python', 'SQL', 'Excel']);
    expect(strict.education[0]).toMatchObject({ institution: 'Example College', degree: 'BA History', year: '2015' });

    const len = parseResume(text, lenient);
    expect(len.sections[0]).toMatchObject({ recognized: true, canonical: 'experience' });
    expect(len.experience[0]).toMatchObject({ title: 'Engineer', employer: 'Acme Corp', start: '2020-01', end: 'present' });
  });

  it('accepts headings ending with a colon and dates on the title line', () => {
    const text = [
      'Sam Q. Placeholder',
      'Berlin, Germany',
      'sam@example.org  +49 30 1234 5678',
      'Experience:',
      'Data Analyst at Example GmbH | Jan 2019 – Dec 2020',
      'Analyst, Sample Ltd (2017 to 2018)',
    ].join('\n');
    const r = parseResume(text, lenient);
    expect(r.contact.name).toBe('Sam Q. Placeholder');
    expect(r.contact.location).toBe('Berlin, Germany');
    expect(r.contact.email).toBe('sam@example.org');
    expect(r.contact.phone).toBe('+49 30 1234 5678');
    expect(r.experience).toEqual([
      { title: 'Data Analyst', employer: 'Example GmbH', start: '2019-01', end: '2020-12', rawDates: 'Jan 2019 – Dec 2020' },
      { title: 'Analyst', employer: 'Sample Ltd', start: '2017', end: '2018', rawDates: '2017 to 2018' },
    ]);
  });

  it('reports experience dates the profile cannot read', () => {
    const text = ['Pat Example', 'Experience', 'Engineer - Acme', 'Mar 2021 - Present'].join('\n');
    const r = parseResume(text, { headings: STRICT_HEADINGS, dateFormats: ['MM/YYYY', 'YYYY'] });
    expect(r.unparsedDates).toEqual(['Mar 2021']);
    expect(r.experience[0]).toMatchObject({ title: 'Engineer', employer: 'Acme', end: 'present' });
    expect(r.experience[0].start).toBeUndefined();
  });

  it('returns an empty result for empty text', () => {
    const r = parseResume('', lenient);
    expect(r).toEqual({
      contact: { links: [] },
      experience: [],
      education: [],
      skills: [],
      sections: [],
      unparsedDates: [],
    });
  });
});
