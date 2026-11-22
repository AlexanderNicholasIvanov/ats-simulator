// Stub written by u1; replaced by u2 (extract). Signatures are part of the contract in src/types.ts.
import type { ExtractedDocument, FileKind } from '../types.ts';

export const MAX_BYTES = 5 * 1024 * 1024;

/** Rejects with ExtractError. */
export function extractFile(_file: File): Promise<ExtractedDocument> {
  throw new Error('not implemented');
}

export function extractPlainText(
  _text: string,
  _fileName?: string,
  _kind?: FileKind,
): ExtractedDocument {
  throw new Error('not implemented');
}
