import { useEffect, useRef } from 'react';
import type { AtsProfile, SimulationResult } from '../types.ts';
import { NOT_FOUND, orNotFound } from './format.ts';
import { KeywordList, ScoreSummary, WarningList } from './parts.tsx';

export interface DetailViewProps {
  result: SimulationResult;
  profile: AtsProfile | undefined;
  onClose: () => void;
}

/** True for form fields and contentEditable elements, where Escape belongs to the field, not the view. */
function isEditable(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable || target.closest('[contenteditable]:not([contenteditable="false"])')) return true;
  return ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
}

export function DetailView({ result, profile, onClose }: DetailViewProps) {
  const heading = useRef<HTMLHeadingElement>(null);
  const { parsed } = result;

  useEffect(() => {
    heading.current?.focus();
  }, []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && !event.isComposing && !isEditable(event.target)) {
        event.preventDefault();
        onClose();
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return (
    <section className="detail panel" aria-labelledby="detail-heading">
      <button type="button" className="secondary" onClick={onClose}>
        Back to all results
      </button>
      <h2 id="detail-heading" ref={heading} tabIndex={-1}>
        {result.profileName}: full details
      </h2>
      {profile?.note && <p className="note">{profile.note}</p>}

      <h3>Score</h3>
      <ScoreSummary result={result} scoring={profile?.scoring} />

      <h3>Extracted fields</h3>
      <p className="muted">
        {result.fieldsFound} of {result.fieldsTotal} fields found
      </p>
      <div className="table-wrap">
        <table className="field-table">
          <caption>Fields as {result.profileName} extracted them</caption>
          <tbody>
            <tr>
              <th scope="row">Name</th>
              <td>{orNotFound(parsed.contact.name)}</td>
            </tr>
            <tr>
              <th scope="row">Email</th>
              <td>{orNotFound(parsed.contact.email)}</td>
            </tr>
            <tr>
              <th scope="row">Phone</th>
              <td>{orNotFound(parsed.contact.phone)}</td>
            </tr>
            <tr>
              <th scope="row">Location</th>
              <td>{orNotFound(parsed.contact.location)}</td>
            </tr>
            <tr>
              <th scope="row">Links</th>
              <td>{parsed.contact.links.length ? parsed.contact.links.join(', ') : NOT_FOUND}</td>
            </tr>
            {parsed.experience.length === 0 ? (
              <tr>
                <th scope="row">Jobs</th>
                <td>{NOT_FOUND}</td>
              </tr>
            ) : (
              parsed.experience.map((job, index) => (
                <tr key={`job-${index}`}>
                  <th scope="row">Job {index + 1}</th>
                  <td>
                    <dl className="inline-fields">
                      <dt>Title</dt>
                      <dd>{orNotFound(job.title)}</dd>
                      <dt>Employer</dt>
                      <dd>{orNotFound(job.employer)}</dd>
                      <dt>Start</dt>
                      <dd>{orNotFound(job.start)}</dd>
                      <dt>End</dt>
                      <dd>{orNotFound(job.end)}</dd>
                    </dl>
                  </td>
                </tr>
              ))
            )}
            {parsed.education.length === 0 ? (
              <tr>
                <th scope="row">Education</th>
                <td>{NOT_FOUND}</td>
              </tr>
            ) : (
              parsed.education.map((edu, index) => (
                <tr key={`edu-${index}`}>
                  <th scope="row">Education {index + 1}</th>
                  <td>
                    {[edu.degree, edu.institution, edu.year].filter(Boolean).join(', ') ||
                      NOT_FOUND}
                  </td>
                </tr>
              ))
            )}
            <tr>
              <th scope="row">Skills</th>
              <td>{parsed.skills.length ? parsed.skills.join(', ') : NOT_FOUND}</td>
            </tr>
            {parsed.unparsedDates.length > 0 && (
              <tr>
                <th scope="row">Unreadable dates</th>
                <td>{parsed.unparsedDates.join(', ')}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {result.jdProvided ? (
        <>
          <KeywordList label="Matched keywords" keywords={result.matched} kind="matched" />
          <KeywordList label="Missing keywords" keywords={result.missing} kind="missing" />
        </>
      ) : (
        <p className="muted">Add a job description to see matched and missing keywords.</p>
      )}

      <h3>Warnings</h3>
      <WarningList warnings={result.warnings} />

      <details className="raw-text">
        <summary>Raw text as this ATS sees it</summary>
        <pre tabIndex={0}>{result.rawText}</pre>
      </details>
    </section>
  );
}
