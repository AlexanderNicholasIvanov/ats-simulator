import { describe, expect, it } from 'vitest';
import {
  ALL_DATE_FORMATS,
  classifyDate,
  findDateRanges,
  findDateTokens,
  isUnreadable,
  parseDate,
} from '../../src/parse/dates.ts';
import type { DateFormatId } from '../../src/types.ts';

describe('parseDate per DateFormatId', () => {
  const cases: [DateFormatId, string, string][] = [
    ['MM/YYYY', '03/2021', '2021-03'],
    ['MM/YYYY', '3/2021', '2021-03'],
    ['Mon YYYY', 'Mar 2021', '2021-03'],
    ['Mon YYYY', 'Sept. 2019', '2019-09'],
    ['Month YYYY', 'March 2021', '2021-03'],
    ['YYYY', '2021', '2021'],
    ['MM-YYYY', '03-2021', '2021-03'],
    ['YYYY-MM', '2021-03', '2021-03'],
    ['Season YYYY', 'Summer 2021', '2021-06'],
    ['Season YYYY', 'Fall 2019', '2019-09'],
  ];
  for (const [format, token, expected] of cases) {
    it(`${format}: '${token}' -> '${expected}'`, () => {
      expect(parseDate(token, [format])).toBe(expected);
      expect(classifyDate(token)?.formats).toContain(format);
    });
  }

  it('only reads the formats it is given', () => {
    expect(parseDate('Mar 2021', ['MM/YYYY', 'YYYY'])).toBeUndefined();
    expect(parseDate('03/2021', ['Mon YYYY'])).toBeUndefined();
    expect(parseDate('Summer 2021', ['YYYY'])).toBeUndefined();
    expect(isUnreadable('Mar 2021', ['MM/YYYY'])).toBe(true);
    expect(isUnreadable('03/2021', ['MM/YYYY'])).toBe(false);
  });

  it("'May' is both an abbreviation and a full month name", () => {
    expect(parseDate('May 2020', ['Mon YYYY'])).toBe('2020-05');
    expect(parseDate('May 2020', ['Month YYYY'])).toBe('2020-05');
  });

  it('maps Present / Current / Now to present for every profile', () => {
    for (const t of ['Present', 'current', 'NOW']) expect(parseDate(t, ['YYYY'])).toBe('present');
  });

  it('rejects invalid months and implausible years', () => {
    expect(parseDate('13/2021', ALL_DATE_FORMATS)).toBeUndefined();
    expect(classifyDate('1234')).toBeUndefined();
    expect(classifyDate('hello')).toBeUndefined();
  });
});

describe('findDateRanges', () => {
  it.each([
    ['Mar 2021 - Present', 'Mar 2021', 'Present'],
    ['06/2018 - 02/2021', '06/2018', '02/2021'],
    ['2016 – 2018', '2016', '2018'],
    ['2016—2018', '2016', '2018'],
    ['2016-2018', '2016', '2018'],
    ['January 2019 to March 2020', 'January 2019', 'March 2020'],
    ['2019-01 - 2020-06', '2019-01', '2020-06'],
    ['03-2019 – Current', '03-2019', 'Current'],
    ['Engineer | Summer 2020 - Fall 2020', 'Summer 2020', 'Fall 2020'],
  ])('%s', (line, start, end) => {
    const [r] = findDateRanges(line);
    expect(r.startRaw).toBe(start);
    expect(r.endRaw).toBe(end);
  });

  it('ignores numbers that are not dates', () => {
    expect(findDateRanges('served 20,000 customers in 2 - 3 days')).toEqual([]);
    expect(findDateTokens('raised coverage from 35% to 80% for 1M users')).toEqual([]);
  });

  it('finds lone date tokens', () => {
    expect(findDateTokens('Shipped v2 in Mar 2021 and again in 2022')).toEqual(['Mar 2021', '2022']);
  });
});
