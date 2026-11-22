import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// a string (not a URL object): the jsdom environment replaces the global URL class.
const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', 'src');

// Built from parts so this test file itself is not a false positive for other scanners.
const FORBIDDEN = [
  'fetch(',
  'XMLHttpRequest',
  'sendBeacon',
  'new WebSocket',
  'http' + '://',
  'https' + '://',
];

function listFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    return statSync(path).isDirectory() ? listFiles(path) : [path];
  });
}

describe('no network (criterion 12)', () => {
  const files = listFiles(SRC);

  it('finds the source files', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it('no file under src/ contains a network API or absolute URL', () => {
    const hits: string[] = [];
    for (const file of files) {
      const text = readFileSync(file, 'utf8');
      for (const needle of FORBIDDEN) {
        if (text.includes(needle)) hits.push(`${relative(SRC, file)}: ${needle}`);
      }
    }
    expect(hits).toEqual([]);
  });
});
