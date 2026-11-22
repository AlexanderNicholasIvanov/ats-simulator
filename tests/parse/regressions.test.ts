// Regression tests for u3 verification round 1 findings.
import { describe, expect, it } from 'vitest';
import { PROFILES, simulate } from '../../src/ats/index.ts';
import { LENIENT_HEADINGS, STRICT_HEADINGS } from '../../src/ats/profiles/headings.ts';
import { ALL_DATE_FORMATS, classifyDate, findDateRanges, parseDate, parseResume } from '../../src/parse/index.ts';
import { SAMPLE_RESUME_TEXT } from '../../src/sample/index.ts';
import { docFromText } from '../ats/helpers.ts';

const lenient = { headings: LENIENT_HEADINGS, dateFormats: ALL_DATE_FORMATS };
const strict = { headings: STRICT_HEADINGS, dateFormats: ALL_DATE_FORMATS };

describe('finding 1: unknown headings without a heading word', () => {
  const text = [
    'Pat Doe',
    'My Journey',
    'I build tools for small teams.',
    'Where I Worked',
    'Engineer - Acme',
    '2019 - 2021',
  ].join('\n');

  it('flags Title Case lines that are not name, contact or job lines', () => {
    const r = parseResume(text, lenient);
    expect(r.contact.name).toBe('Pat Doe');
    expect(r.sections).toEqual([
      { heading: 'My Journey', recognized: false },
      { heading: 'Where I Worked', recognized: false },
    ]);
  });

  it('yields unknown-heading warnings in the simulator', () => {
    const res = simulate(docFromText(text), undefined, PROFILES[3]);
    const unknown = res.warnings.filter((w) => w.code === 'unknown-heading');
    expect(unknown).toHaveLength(2);
    expect(unknown[0].message).toContain('My Journey');
  });

  it('does not flag job title lines followed by dates, taglines, or the sample resume', () => {
    const jobs = [
      'Jordan Rivera',
      'Frontend Developer',
      'Experience',
      'Senior Software Engineer',
      'Mar 2021 - Present',
      'Platform Lead',
      'Lonestar Analytics',
      '2019 - 2021',
      'Education',
      'University Of Texas',
      'Skills',
      'JavaScript',
      'AWS',
    ].join('\n');
    const r = parseResume(jobs, lenient);
    expect(r.sections.filter((s) => !s.recognized)).toEqual([]);
    expect(r.experience.map((j) => j.title)).toEqual(['Senior Software Engineer', 'Platform Lead']);
    expect(r.experience[1].employer).toBe('Lonestar Analytics');
    expect(r.skills).toEqual(['JavaScript', 'AWS']);

    for (const opts of [lenient, strict]) {
      expect(parseResume(SAMPLE_RESUME_TEXT, opts).sections.filter((s) => !s.recognized)).toEqual([]);
    }
    for (const p of PROFILES) {
      const res = simulate(docFromText(SAMPLE_RESUME_TEXT), undefined, p);
      expect(res.warnings.map((w) => w.code), p.id).not.toContain('unknown-heading');
    }
  });

  it('does not flag a trailing Title Case line with no content after it', () => {
    const r = parseResume('Pat Doe\nSkills\nGo, Rust\nThe End', lenient);
    expect(r.sections.filter((s) => !s.recognized)).toEqual([]);
  });
});

describe('finding 2: non-ASCII names and places', () => {
  it.each([
    ['José Núñez\nMontréal, Canada', 'José Núñez', 'Montréal, Canada'],
    ['Zoë Müller\nSão Paulo, Brazil', 'Zoë Müller', 'São Paulo, Brazil'],
    ['Łukasz Żółć\nKraków, Poland', 'Łukasz Żółć', 'Kraków, Poland'],
  ])('%j', (text, name, location) => {
    const r = parseResume(text, lenient);
    expect(r.contact.name).toBe(name);
    expect(r.contact.location).toBe(location);
  });
});

describe('finding 3: ZIP codes and separated segments', () => {
  it.each([
    ['Pat Doe\nNew York, NY 10001', 'New York, NY'],
    ['Pat Doe\nAustin, TX 78701 | 555-010-2345', 'Austin, TX'],
    ['Pat Doe\npat@example.com • Seattle, WA 98101-1234 • linkedin.com/in/pat', 'Seattle, WA'],
  ])('%j', (text, location) => {
    const r = parseResume(text, lenient);
    expect(r.contact.location).toBe(location);
  });

  it('still reads the phone next to the location', () => {
    expect(parseResume('Pat Doe\nAustin, TX 78701 | 555-010-2345', lenient).contact.phone).toBe('555-010-2345');
  });
});

describe('finding 4: job lines are not locations', () => {
  it('prefers City, ST over an earlier "Title, Team" line', () => {
    const r = parseResume('Jordan Rivera\nSenior Engineer, Platform\nAustin, TX', lenient);
    expect(r.contact.location).toBe('Austin, TX');
  });

  it('accepts City, Country only for known countries and never for job titles', () => {
    expect(parseResume('Pat Doe\nProduct Manager, Germany', lenient).contact.location).toBeUndefined();
    expect(parseResume('Pat Doe\nAcme Labs, Platform', lenient).contact.location).toBeUndefined();
    expect(parseResume('Pat Doe\nBerlin, Germany', lenient).contact.location).toBe('Berlin, Germany');
  });
});

describe("finding 5: 'YYYY-YY' year ranges", () => {
  it("reads '2018-19' as 2018 to 2019 under the 'YYYY' format", () => {
    expect(classifyDate('2018-19')).toEqual({ formats: ['YYYY'], normalized: '2018' });
    const [r] = findDateRanges('Analyst - Acme | 2018-19');
    expect(r).toMatchObject({ raw: '2018-19', startRaw: '2018', endRaw: '2019' });
    const [r2] = findDateRanges('2018 – 19');
    expect(r2).toMatchObject({ startRaw: '2018', endRaw: '2019' });
    expect(findDateRanges('1999-00')[0]).toMatchObject({ startRaw: '1999', endRaw: '2000' });
  });

  it("keeps '2021-03' as YYYY-MM", () => {
    expect(findDateRanges('2021-03')).toEqual([]);
    expect(parseDate('2021-03', ['YYYY-MM'])).toBe('2021-03');
  });

  it('parses a job with a short year range', () => {
    const r = parseResume('Pat Doe\nExperience\nAnalyst - Acme\n2018-19', {
      headings: STRICT_HEADINGS,
      dateFormats: ['YYYY'],
    });
    expect(r.experience[0]).toMatchObject({ title: 'Analyst', employer: 'Acme', start: '2018', end: '2019' });
    expect(r.unparsedDates).toEqual([]);
  });
});
