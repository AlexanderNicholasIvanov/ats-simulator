import { DISCLAIMER, PRIVACY_NOTE } from './format.ts';

export function Header() {
  return (
    <header className="site-header">
      <h1>ATS Simulator</h1>
      <p className="subtitle">
        See how eight popular applicant tracking systems would read and score your resume.
      </p>
      <p className="disclaimer">{DISCLAIMER}</p>
      <p className="privacy">{PRIVACY_NOTE}</p>
    </header>
  );
}
