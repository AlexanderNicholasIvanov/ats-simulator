import { describe, expect, it } from 'vitest';
import config from '../vite.config.ts';

describe('vite config', () => {
  it('builds for the GitHub Pages project path', () => {
    expect(config.base).toBe('/ats-simulator/');
  });
});
