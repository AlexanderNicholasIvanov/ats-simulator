// Module mocks for src/ats and src/extract, used through vi.mock factories in the UI tests:
//   vi.mock('../../src/ats/index.ts', async () => (await import('./mocks.ts')).atsModule);
// Keep this file free of runtime imports from src/ so the factories cannot loop.
import { vi } from 'vitest';
import type { SimulationResult } from '../../src/types.ts';
import { fakeBuildReport, fakeDoc, fakeProfiles, fakeResults } from './fixtures.ts';

export const atsModule = {
  PROFILES: fakeProfiles,
  validateProfile: vi.fn(() => []),
  simulate: vi.fn(),
  simulateAll: vi.fn(() => fakeResults),
  rankResults: vi.fn((results: SimulationResult[]) => [...results].reverse()),
  buildReport: vi.fn(fakeBuildReport),
};

export const extractModule = {
  MAX_BYTES: 5 * 1024 * 1024,
  extractFile: vi.fn(async () => fakeDoc),
  extractPlainText: vi.fn(() => fakeDoc),
};
