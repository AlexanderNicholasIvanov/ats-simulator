import type { AtsProfile, SimulationResult } from '../types.ts';
import { outcomeLabel } from './format.ts';
import { ResultCard } from './ResultCard.tsx';

export interface ResultsProps {
  /** results in PROFILES order */
  results: SimulationResult[];
  /** the same results, best outcome first */
  ranked: SimulationResult[];
  profiles: AtsProfile[];
  onOpen: (profileId: string) => void;
  onDownload: () => void;
}

export function Results({ results, ranked, profiles, onOpen, onDownload }: ResultsProps) {
  return (
    <section className="results" aria-labelledby="results-heading">
      <div className="results-head">
        <h2 id="results-heading">Results</h2>
        <button type="button" className="secondary" onClick={onDownload}>
          Download report
        </button>
      </div>

      <section className="panel ranking" aria-labelledby="ranking-heading">
        <h3 id="ranking-heading">Ranking, best to worst</h3>
        <ol aria-label="Ranking">
          {ranked.map((result) => (
            <li key={result.profileId}>
              <span className="rank-name">{result.profileName}</span>{' '}
              <span className="rank-outcome">{outcomeLabel(result)}</span>
            </li>
          ))}
        </ol>
      </section>

      <div className="grid">
        {results.map((result) => (
          <ResultCard
            key={result.profileId}
            result={result}
            profile={profiles.find((p) => p.id === result.profileId)}
            onOpen={onOpen}
          />
        ))}
      </div>
    </section>
  );
}
