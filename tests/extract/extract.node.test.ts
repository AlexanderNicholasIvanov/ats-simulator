// @vitest-environment node
// Extraction must also work outside jsdom (other suites may run in the node environment).
import { describe, expect, it } from 'vitest';
import { extractFile } from '../../src/extract/index.ts';
import { allText, fixtureFile } from './helpers.ts';

describe('extractFile in the node environment', () => {
  it('reads the simple PDF', async () => {
    const text = allText(await extractFile(fixtureFile('resume-simple.pdf')));
    expect(text).toContain('Casey Morgan');
    expect(text).toContain('casey.morgan@example.com');
  });

  it('reads the DOCX (raw-text fallback without a DOM) including its header', async () => {
    const doc = await extractFile(fixtureFile('resume.docx'));
    expect(allText(doc)).toContain('Casey Morgan');
    expect(doc.layout.headerText).toContain('casey.morgan@example.com');
  });
});
