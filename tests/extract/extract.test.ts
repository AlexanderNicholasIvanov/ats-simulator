import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { MAX_BYTES, extractFile, extractPlainText } from '../../src/extract/index.ts';
import { ExtractError } from '../../src/types.ts';
import { allText, fixtureFile, makeFile } from './helpers.ts';

const NAME = 'Casey Morgan';
const EMAIL = 'casey.morgan@example.com';

async function rejection(p: Promise<unknown>): Promise<ExtractError> {
  try {
    await p;
  } catch (err) {
    expect(err).toBeInstanceOf(ExtractError);
    return err as ExtractError;
  }
  throw new Error('expected a rejection');
}

describe('extractPlainText', () => {
  it('makes one body line per non-empty trimmed line', () => {
    const doc = extractPlainText(`  ${NAME}  \n\n${EMAIL}\r\n   \nSkills`);
    expect(doc.kind).toBe('paste');
    expect(doc.fileName).toBe('pasted.txt');
    expect(doc.lines.map((l) => l.text)).toEqual([NAME, EMAIL, 'Skills']);
    expect(doc.lines.map((l) => l.y)).toEqual([0, 1, 2]);
    for (const l of doc.lines) {
      expect(l).toMatchObject({ x: 0, column: 0, region: 'body', page: 1 });
    }
    expect(doc.layout).toEqual({
      columns: 1,
      hasTables: false,
      hasTextBoxes: false,
      headerText: '',
      footerText: '',
      imageOnly: false,
    });
  });

  it('returns no lines for empty text instead of throwing', () => {
    expect(extractPlainText('').lines).toEqual([]);
    expect(extractPlainText('  \n \n').lines).toEqual([]);
  });

  it('pasted resume text contains the name and email', () => {
    const text = readFileSync(join(__dirname, '..', 'fixtures', 'resume.txt'), 'utf8');
    const joined = allText(extractPlainText(text));
    expect(joined).toContain(NAME);
    expect(joined).toContain(EMAIL);
  });
});

describe('extractFile: txt', () => {
  it('reads the .txt fixture', async () => {
    const doc = await extractFile(fixtureFile('resume.txt'));
    expect(doc.kind).toBe('txt');
    expect(doc.fileName).toBe('resume.txt');
    expect(allText(doc)).toContain(NAME);
    expect(allText(doc)).toContain(EMAIL);
  });

  it('accepts upper-case extensions', async () => {
    const doc = await extractFile(makeFile(new TextEncoder().encode(`${NAME}\n${EMAIL}`), 'CV.TXT'));
    expect(doc.lines.map((l) => l.text)).toEqual([NAME, EMAIL]);
  });
});

describe('extractFile: rejections', () => {
  it.each(['photo.png', 'setup.exe', 'resume.doc', 'noextension'])('rejects %s as unsupported-type', async (name) => {
    const err = await rejection(extractFile(makeFile(new Uint8Array([1, 2, 3]), name)));
    expect(err.code).toBe('unsupported-type');
    expect(err.message).toMatch(/^Unsupported file type: .*\. Use PDF, DOCX or TXT\.$/);
  });

  it('names the extension in the message', async () => {
    const err = await rejection(extractFile(makeFile(new Uint8Array([1]), 'photo.PNG')));
    expect(err.message).toBe('Unsupported file type: .png. Use PDF, DOCX or TXT.');
  });

  it('rejects files over 5 MB as too-large', async () => {
    const err = await rejection(extractFile(makeFile(new Uint8Array(MAX_BYTES + 1), 'big.pdf')));
    expect(err.code).toBe('too-large');
    expect(err.message).toBe('File is larger than 5 MB.');
  });

  it('rejects garbage bytes named .pdf as corrupt', async () => {
    const garbage = new TextEncoder().encode('this is definitely not a pdf file '.repeat(20));
    const err = await rejection(extractFile(makeFile(garbage, 'resume.pdf')));
    expect(err.code).toBe('corrupt');
    expect(err.message).toMatch(/PDF/);
  });

  it('rejects garbage bytes named .docx as corrupt', async () => {
    const err = await rejection(extractFile(makeFile(new Uint8Array(200).fill(7), 'resume.docx')));
    expect(err.code).toBe('corrupt');
    expect(err.message).toMatch(/DOCX/);
  });
});

describe('extractFile: pdf', () => {
  it('reads a simple text-based PDF', async () => {
    const doc = await extractFile(fixtureFile('resume-simple.pdf'));
    expect(doc.kind).toBe('pdf');
    expect(doc.pages).toBe(1);
    expect(doc.layout.columns).toBe(1);
    expect(doc.layout.imageOnly).toBe(false);
    const text = allText(doc);
    expect(text).toContain(NAME);
    expect(text).toContain(EMAIL);
    const lines = doc.lines.map((l) => l.text);
    expect(lines).toContain('Experience');
    expect(lines).toContain('Jan 2021 - Present');
    expect(lines.indexOf('Summary')).toBeLessThan(lines.indexOf('Experience'));
    expect(lines.indexOf('Experience')).toBeLessThan(lines.indexOf('Education'));
    expect(doc.lines.every((l) => l.column === 0 && l.region === 'body')).toBe(true);
  });

  it('flags an image-only PDF without throwing', async () => {
    const doc = await extractFile(fixtureFile('resume-image-only.pdf'));
    expect(doc.pages).toBe(1);
    expect(doc.lines).toHaveLength(0);
    expect(doc.layout.imageOnly).toBe(true);
  });

  it('detects two columns and reads the left column before the right', async () => {
    const doc = await extractFile(fixtureFile('resume-two-column.pdf'));
    expect(doc.layout.columns).toBe(2);
    const cols = doc.lines.filter((l) => l.region === 'body').map((l) => l.column);
    expect(cols).toContain(0);
    expect(cols).toContain(1);
    // all column-0 lines come before every column-1 line
    expect(cols.lastIndexOf(0)).toBeLessThan(cols.indexOf(1));
    const left = doc.lines.filter((l) => l.column === 0).map((l) => l.text);
    const right = doc.lines.filter((l) => l.column === 1).map((l) => l.text);
    expect(left).toContain(EMAIL);
    expect(left).toContain('Skills');
    expect(right).toContain('Experience');
    // no line mixes text from both columns
    expect(doc.lines.some((l) => l.text.includes('Summary') && l.text.includes(NAME))).toBe(false);
    expect(allText(doc)).toContain(NAME);
  });

  it('puts contact details in the top of the page into the header region', async () => {
    const doc = await extractFile(fixtureFile('resume-header-contact.pdf'));
    const emailLine = doc.lines.find((l) => l.text.includes(EMAIL));
    expect(emailLine?.region).toBe('header');
    expect(doc.layout.headerText).toContain(EMAIL);
    expect(doc.layout.headerText).toContain(NAME);
    expect(doc.lines[0].region).toBe('header');
    expect(doc.lines.find((l) => l.text === 'Experience')?.region).toBe('body');
    expect(doc.layout.columns).toBe(1);
  });
});

describe('extractFile: docx', () => {
  it('reads paragraphs, a skills table and the page header', async () => {
    const doc = await extractFile(fixtureFile('resume.docx'));
    expect(doc.kind).toBe('docx');
    const text = allText(doc);
    expect(text).toContain(NAME);
    expect(text).toContain(EMAIL);

    expect(doc.layout.hasTables).toBe(true);
    const rows = doc.lines.filter((l) => l.inTable);
    expect(rows.map((r) => r.text)).toEqual(['Python | Go | AWS', 'Kubernetes | Terraform | PostgreSQL']);

    expect(doc.layout.headerText).toContain(EMAIL);
    expect(doc.lines[0]).toMatchObject({ region: 'header' });
    expect(doc.lines[0].text).toContain(EMAIL);
    expect(doc.layout.hasTextBoxes).toBe(false);
    expect(doc.lines.map((l) => l.y)).toEqual(doc.lines.map((_, i) => i));
  });
});

describe('fixtures', () => {
  it('ships every fixture the extraction tests rely on', () => {
    const files = readdirSync(join(__dirname, '..', 'fixtures'));
    for (const f of [
      'resume-simple.pdf',
      'resume-two-column.pdf',
      'resume-header-contact.pdf',
      'resume-image-only.pdf',
      'resume.docx',
      'resume.txt',
    ]) {
      expect(files).toContain(f);
    }
  });
});
