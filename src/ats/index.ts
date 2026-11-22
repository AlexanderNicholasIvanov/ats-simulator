// ATS engine entry point. Signatures are part of the contract in src/types.ts.
export { PROFILES } from './profiles/index.ts';
export { validateProfile } from './validate.ts';
export { simulate, simulateAll, rankResults, buildReport } from './simulate.ts';
