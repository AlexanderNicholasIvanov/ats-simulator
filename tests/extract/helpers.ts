import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export const FIXTURES = join(__dirname, '..', 'fixtures');

/** Builds a File from bytes; polyfills arrayBuffer() when the test environment's File lacks it. */
export function makeFile(bytes: Uint8Array, name: string): File {
  const file = new File([bytes as BlobPart], name);
  if (typeof file.arrayBuffer !== 'function') {
    const copy = bytes.slice();
    Object.defineProperty(file, 'arrayBuffer', {
      value: () => Promise.resolve(copy.buffer),
    });
  }
  return file;
}

export function fixtureFile(name: string): File {
  return makeFile(new Uint8Array(readFileSync(join(FIXTURES, name))), name);
}

export function allText(doc: { lines: { text: string }[] }): string {
  return doc.lines.map((l) => l.text).join('\n');
}
