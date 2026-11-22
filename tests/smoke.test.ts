import { describe, expect, it } from 'vitest';
import * as ats from '../src/ats/index.ts';
import { MAX_BYTES, extractFile, extractPlainText } from '../src/extract/index.ts';
import { SAMPLE_JD, SAMPLE_RESUME_TEXT } from '../src/sample/index.ts';
import { ExtractError } from '../src/types.ts';

describe('scaffold smoke', () => {
  it('ships a fictional sample resume and job description', () => {
    expect(SAMPLE_RESUME_TEXT).toContain('Jordan Rivera');
    expect(SAMPLE_RESUME_TEXT).toContain('jordan.rivera@example.com');
    expect(SAMPLE_JD.trim().length).toBeGreaterThan(0);
  });

  it('caps uploads at 5 MB', () => {
    expect(MAX_BYTES).toBe(5 * 1024 * 1024);
  });

  it('exposes the contract entry points', () => {
    expect(typeof extractFile).toBe('function');
    expect(typeof extractPlainText).toBe('function');
    expect(Array.isArray(ats.PROFILES)).toBe(true);
    for (const fn of [
      ats.validateProfile,
      ats.simulate,
      ats.simulateAll,
      ats.rankResults,
      ats.buildReport,
    ]) {
      expect(typeof fn).toBe('function');
    }
  });

  it('ExtractError carries a code and name', () => {
    const err = new ExtractError('too-large', 'File is larger than 5 MB');
    expect(err).toBeInstanceOf(Error);
    expect(err.code).toBe('too-large');
    expect(err.name).toBe('ExtractError');
  });
});
