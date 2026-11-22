import type { AtsProfile, Severity, SimulationResult } from '../types.ts';

export const DISCLAIMER =
  'Simulations are approximations built from public documentation and common recruiter knowledge; not affiliated with or endorsed by any ATS vendor.';

export const PRIVACY_NOTE = 'Runs entirely in your browser - your resume is never uploaded.';

export const NOT_FOUND = 'Not found';

const SEVERITY_WORD: Record<Severity, string> = {
  error: 'Error',
  warning: 'Warning',
  info: 'Info',
};

export function severityWord(severity: Severity): string {
  return SEVERITY_WORD[severity];
}

export type ScoringMode = AtsProfile['scoring'];

/** Short outcome label used in the ranking list. */
export function outcomeLabel(result: SimulationResult): string {
  if (result.score !== null) return `${result.score}/100`;
  if (result.searchMatch !== null) return `search match ${result.searchMatch}%`;
  return 'not scored';
}

export const RESULTS_HEADING_ID = 'results-heading';

/** DOM id helpers so cards, headings and buttons can reference each other. */
export function cardTitleId(profileId: string): string {
  return `card-title-${profileId}`;
}

export function detailsButtonId(profileId: string): string {
  return `details-button-${profileId}`;
}

export function orNotFound(value: string | undefined): string {
  return value && value.trim() ? value : NOT_FOUND;
}
