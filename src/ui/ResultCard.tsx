import type { AtsProfile, SimulationResult } from '../types.ts';
import { NOT_FOUND, cardTitleId, detailsButtonId, orNotFound } from './format.ts';
import { KeywordList, ScoreSummary, WarningList } from './parts.tsx';

export interface ResultCardProps {
  result: SimulationResult;
  profile: AtsProfile | undefined;
  onOpen: (profileId: string) => void;
}

const CHIP_LIMIT = 8;

function countOrNotFound(count: number): string {
  return count > 0 ? String(count) : NOT_FOUND;
}

/** The first link, plus how many more there are; "Not found" when there are none. */
function linksSummary(links: string[]): string {
  if (links.length === 0) return NOT_FOUND;
  return links.length === 1 ? links[0] : `${links[0]} (+${links.length - 1} more)`;
}

export function ResultCard({ result, profile, onOpen }: ResultCardProps) {
  const { parsed } = result;
  const titleId = cardTitleId(result.profileId);
  const firstEducation = parsed.education[0];
  const education = firstEducation
    ? [firstEducation.degree, firstEducation.institution].filter(Boolean).join(', ') ||
      String(parsed.education.length)
    : NOT_FOUND;

  return (
    <article className="card" aria-labelledby={titleId}>
      <h3 id={titleId}>{result.profileName}</h3>

      <section className="card-section" aria-label={`What ${result.profileName} extracted`}>
        <h4>Parsed fields</h4>
        <dl className="fields">
          <dt>Name</dt>
          <dd>{orNotFound(parsed.contact.name)}</dd>
          <dt>Email</dt>
          <dd>{orNotFound(parsed.contact.email)}</dd>
          <dt>Phone</dt>
          <dd>{orNotFound(parsed.contact.phone)}</dd>
          <dt>Location</dt>
          <dd>{orNotFound(parsed.contact.location)}</dd>
          <dt>Links</dt>
          <dd>{linksSummary(parsed.contact.links)}</dd>
          <dt>Jobs</dt>
          <dd>{countOrNotFound(parsed.experience.length)}</dd>
          <dt>Education</dt>
          <dd>{education}</dd>
          <dt>Skills</dt>
          <dd>{countOrNotFound(parsed.skills.length)}</dd>
        </dl>
        <p className="muted">
          {result.fieldsFound} of {result.fieldsTotal} fields found
        </p>
      </section>

      <section className="card-section" aria-label={`${result.profileName} score`}>
        <h4>Score</h4>
        <ScoreSummary result={result} scoring={profile?.scoring} />
        {result.jdProvided && (
          <>
            <KeywordList
              label="Matched keywords"
              keywords={result.matched}
              kind="matched"
              limit={CHIP_LIMIT}
            />
            <KeywordList
              label="Missing keywords"
              keywords={result.missing}
              kind="missing"
              limit={CHIP_LIMIT}
            />
          </>
        )}
      </section>

      <section className="card-section" aria-label={`${result.profileName} warnings`}>
        <h4>Warnings</h4>
        <WarningList warnings={result.warnings} />
      </section>

      <details className="raw-text">
        <summary>Raw text as this ATS sees it</summary>
        <pre tabIndex={0}>{result.rawText}</pre>
      </details>

      {profile?.note && <p className="note">{profile.note}</p>}

      <button
        type="button"
        id={detailsButtonId(result.profileId)}
        className="secondary details-button"
        onClick={() => onOpen(result.profileId)}
      >
        View details for {result.profileName}
      </button>
    </article>
  );
}
