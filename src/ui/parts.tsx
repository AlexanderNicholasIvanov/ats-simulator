import type { SimulationResult, Warning } from '../types.ts';
import { severityWord, type ScoringMode } from './format.ts';

export function WarningList({ warnings }: { warnings: Warning[] }) {
  if (warnings.length === 0) {
    return <p className="muted">No formatting warnings.</p>;
  }
  return (
    <ul className="warnings">
      {warnings.map((warning, index) => (
        <li key={`${warning.code}-${index}`} className={`warning severity-${warning.severity}`}>
          <span className="severity">
            <span aria-hidden="true">{warning.severity === 'info' ? 'i' : '!'}</span>{' '}
            {severityWord(warning.severity)}:
          </span>{' '}
          {warning.message}
        </li>
      ))}
    </ul>
  );
}

export interface KeywordListProps {
  label: string;
  keywords: string[];
  kind: 'matched' | 'missing';
  /** show at most this many chips, then "+N more"; undefined = show all */
  limit?: number;
}

export function KeywordList({ label, keywords, kind, limit }: KeywordListProps) {
  const shown = limit === undefined ? keywords : keywords.slice(0, limit);
  const rest = keywords.length - shown.length;
  return (
    <div className="keywords">
      <h4>
        {label} ({keywords.length})
      </h4>
      {keywords.length === 0 ? (
        <p className="muted">None</p>
      ) : (
        <ul className={`chips chips-${kind}`}>
          {shown.map((keyword) => (
            <li key={keyword} className="chip">
              {keyword}
            </li>
          ))}
          {rest > 0 && <li className="chip chip-more">+{rest} more</li>}
        </ul>
      )}
    </div>
  );
}

export function ScoreSummary({
  result,
  scoring,
}: {
  result: SimulationResult;
  scoring: ScoringMode | undefined;
}) {
  if (result.score !== null) {
    const score = Math.max(0, Math.min(100, result.score));
    return (
      <div className="score">
        <p className="score-label">Match score</p>
        <p className="score-value">
          <strong>{result.score}</strong>/100
        </p>
        <div className="bar" aria-hidden="true">
          <div className="bar-fill" style={{ width: `${score}%` }} />
        </div>
      </div>
    );
  }
  if (scoring === 'search-match') {
    return (
      <div className="score">
        <p className="score-label">Not scored by this ATS - recruiter search match</p>
        {result.jdProvided && result.searchMatch !== null ? (
          <p className="score-value">
            <strong>{result.searchMatch}%</strong> of job keywords found
          </p>
        ) : (
          <p className="muted">Add a job description to score</p>
        )}
      </div>
    );
  }
  return (
    <div className="score">
      <p className="muted">
        {result.jdProvided ? 'Not scored' : 'Add a job description to score'}
      </p>
    </div>
  );
}
