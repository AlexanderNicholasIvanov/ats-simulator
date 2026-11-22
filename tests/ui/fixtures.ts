// Fictional test data for the UI tests. "Casey Example" is not a real person.
import type { AtsProfile, ExtractedDocument, Report, SimulationResult } from '../../src/types.ts';

const PROFILE_DEFS: Array<[string, string, AtsProfile['scoring']]> = [
  ['workday', 'Workday', 'score'],
  ['taleo', 'Oracle Taleo', 'score'],
  ['icims', 'iCIMS', 'score'],
  ['greenhouse', 'Greenhouse', 'search-match'],
  ['lever', 'Lever', 'search-match'],
  ['successfactors', 'SAP SuccessFactors', 'score'],
  ['smartrecruiters', 'SmartRecruiters', 'score'],
  ['jobvite', 'Jobvite', 'score'],
];

export function makeProfile(id: string, name: string, scoring: AtsProfile['scoring']): AtsProfile {
  return {
    id,
    name,
    vendor: `${name} vendor`,
    note: `${name} test note about parsing behaviour.`,
    basis: 'test fixture',
    parser: {
      readsHeaderFooter: true,
      handlesColumns: true,
      handlesTables: true,
      readsTextBoxes: true,
      preferredFormats: ['docx', 'pdf', 'txt', 'paste'],
    },
    headings: { experience: ['experience'] },
    dateFormats: ['Mon YYYY'],
    keywordMode: 'exact',
    scoring,
    weights: { keywords: 0.6, completeness: 0.3, formatting: 0.1 },
  };
}

export const fakeProfiles: AtsProfile[] = PROFILE_DEFS.map(([id, name, scoring]) =>
  makeProfile(id, name, scoring),
);

export function makeResult(
  profile: AtsProfile,
  index: number,
  jdProvided = true,
): SimulationResult {
  const searchMatch = profile.scoring === 'search-match';
  return {
    profileId: profile.id,
    profileName: profile.name,
    rawText: `Casey Example\nRaw text for ${profile.name}`,
    parsed: {
      contact: {
        name: 'Casey Example',
        email: 'casey@example.com',
        phone: '(555) 010-0000',
        location: index % 2 === 0 ? 'Springfield' : undefined,
        links: [],
      },
      experience: [
        { title: 'Software Engineer', employer: 'Example Corp', start: '2020-01', end: 'present' },
        { title: 'Junior Developer', employer: 'Sample LLC', start: '2017-06', end: '2019-12' },
      ],
      education: [{ institution: 'Example University', degree: 'BSc Computer Science' }],
      skills: ['React', 'TypeScript', 'Testing'],
      sections: [{ heading: 'Experience', recognized: true, canonical: 'experience' }],
      unparsedDates: [],
    },
    fieldsFound: 7,
    fieldsTotal: 8,
    jdProvided,
    score: jdProvided && !searchMatch ? 90 - index * 5 : null,
    searchMatch: jdProvided && searchMatch ? 70 - index : null,
    matched: jdProvided
      ? ['react', 'typescript', 'testing', 'aws', 'css', 'html', 'git', 'agile', 'jest', 'node']
      : [],
    missing: jdProvided ? ['kubernetes', 'graphql'] : [],
    warnings: [
      { severity: 'warning', code: 'two-column', message: `${profile.name} reads columns poorly.` },
      { severity: 'error', code: 'header-contact', message: 'Contact details in the header.' },
      { severity: 'info', code: 'format', message: 'DOCX is preferred.' },
    ],
  };
}

export const fakeResults: SimulationResult[] = fakeProfiles.map((p, i) => makeResult(p, i));

export const fakeDoc: ExtractedDocument = {
  kind: 'paste',
  fileName: 'pasted-text.txt',
  lines: [{ text: 'Casey Example', page: 1, x: 0, y: 0, column: 0, region: 'body' }],
  pages: 1,
  layout: {
    columns: 1,
    hasTables: false,
    hasTextBoxes: false,
    headerText: '',
    footerText: '',
    imageOnly: false,
  },
};

export function fakeBuildReport(fileName: string, results: SimulationResult[]): Report {
  return {
    generatedAt: '2026-01-01T00:00:00.000Z',
    fileName,
    results: results.map((r) => ({
      profileId: r.profileId,
      profileName: r.profileName,
      score: r.score,
      searchMatch: r.searchMatch,
      matched: r.matched,
      missing: r.missing,
      warnings: r.warnings,
      fields: r.parsed,
    })),
  };
}
