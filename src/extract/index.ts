// Resume extraction entry points. Everything runs locally in the browser; nothing is uploaded.
import { ExtractError, type ExtractedDocument, type FileKind } from '../types.ts';
import { extractDocx } from './docx.ts';
import { extractPdf } from './pdf.ts';
import { extractPlainText } from './text.ts';

export { extractPlainText };

export const MAX_BYTES = 5 * 1024 * 1024;

const KINDS: Record<string, Exclude<FileKind, 'paste'>> = { pdf: 'pdf', docx: 'docx', txt: 'txt' };

function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot > 0 && dot < name.length - 1 ? name.slice(dot + 1).toLowerCase() : '';
}

/** Rejects with ExtractError: 'unsupported-type', 'too-large' or 'corrupt'. */
export async function extractFile(file: File): Promise<ExtractedDocument> {
  const ext = extensionOf(file.name);
  const kind = KINDS[ext];
  if (!kind) {
    throw new ExtractError(
      'unsupported-type',
      `Unsupported file type: ${ext ? `.${ext}` : 'no extension'}. Use PDF, DOCX or TXT.`,
    );
  }
  if (file.size > MAX_BYTES) throw new ExtractError('too-large', 'File is larger than 5 MB.');

  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(await file.arrayBuffer());
  } catch (_err) {
    throw new ExtractError('corrupt', 'Could not read this file. Please try again.');
  }

  if (kind === 'txt') {
    return extractPlainText(new TextDecoder('utf-8').decode(bytes), file.name, 'txt');
  }
  try {
    return kind === 'pdf' ? await extractPdf(bytes, file.name) : await extractDocx(bytes, file.name);
  } catch (_err) {
    throw new ExtractError(
      'corrupt',
      kind === 'pdf'
        ? 'Could not read this PDF. It may be damaged or password-protected.'
        : 'Could not read this DOCX. It may be damaged or not a Word document.',
    );
  }
}
