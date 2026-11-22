// Stub written by u1; replaced by u3 (parse + ATS engine). Signatures are part of the contract in src/types.ts.
import type { AtsProfile, ExtractedDocument, Report, SimulationResult } from '../types.ts';

/** 8 default profiles, registry order. */
export const PROFILES: AtsProfile[] = [];

/** [] = valid; else error messages. */
export function validateProfile(_p: unknown): string[] {
  throw new Error('not implemented');
}

export function simulate(
  _doc: ExtractedDocument,
  _jd: string | undefined,
  _profile: AtsProfile,
): SimulationResult {
  throw new Error('not implemented');
}

export function simulateAll(_doc: ExtractedDocument, _jd?: string): SimulationResult[] {
  throw new Error('not implemented');
}

/** Best outcome first. */
export function rankResults(_results: SimulationResult[]): SimulationResult[] {
  throw new Error('not implemented');
}

export function buildReport(_fileName: string, _results: SimulationResult[]): Report {
  throw new Error('not implemented');
}
