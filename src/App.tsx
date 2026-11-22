import { useCallback, useMemo, useState } from 'react';
import { flushSync } from 'react-dom';
import { PROFILES, buildReport, rankResults, simulateAll } from './ats/index.ts';
import { extractFile, extractPlainText } from './extract/index.ts';
import { SAMPLE_JD, SAMPLE_RESUME_TEXT } from './sample/index.ts';
import type { SimulationResult } from './types.ts';
import { DetailView } from './ui/DetailView.tsx';
import { Header } from './ui/Header.tsx';
import { InputPanel } from './ui/InputPanel.tsx';
import { Results } from './ui/Results.tsx';
import { detailsButtonId } from './ui/format.ts';
import { downloadReport } from './ui/report.ts';
import './styles.css';

interface Simulation {
  fileName: string;
  results: SimulationResult[];
  ranked: SimulationResult[];
}

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return 'Something went wrong while reading the resume.';
}

export default function App() {
  const [file, setFile] = useState<File | null>(null);
  const [resumeText, setResumeText] = useState('');
  const [jd, setJd] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [simulation, setSimulation] = useState<Simulation | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  const handleLoadSample = useCallback(() => {
    setFile(null);
    setResumeText(SAMPLE_RESUME_TEXT);
    setJd(SAMPLE_JD);
  }, []);

  const handleSimulate = useCallback(async () => {
    setBusy(true);
    setError(null);
    setSimulation(null);
    setOpenId(null);
    try {
      const doc = file ? await extractFile(file) : extractPlainText(resumeText);
      const results = simulateAll(doc, jd.trim() ? jd : undefined);
      setSimulation({ fileName: doc.fileName, results, ranked: rankResults(results) });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }, [file, resumeText, jd]);

  const handleClose = useCallback(() => {
    if (openId === null) return;
    // Render the grid synchronously so the card's button exists, then return focus to it.
    flushSync(() => setOpenId(null));
    document.getElementById(detailsButtonId(openId))?.focus();
  }, [openId]);

  const handleDownload = useCallback(() => {
    if (simulation) downloadReport(buildReport(simulation.fileName, simulation.results));
  }, [simulation]);

  const openResult = useMemo(
    () => simulation?.results.find((r) => r.profileId === openId) ?? null,
    [simulation, openId],
  );

  return (
    <div className="app">
      <Header />
      <main>
        <InputPanel
          file={file}
          resumeText={resumeText}
          jd={jd}
          busy={busy}
          onFileChange={setFile}
          onResumeTextChange={setResumeText}
          onJdChange={setJd}
          onLoadSample={handleLoadSample}
          onSimulate={() => void handleSimulate()}
        />

        <div role="alert" className={error ? 'error' : 'error empty'}>
          {error}
        </div>

        {simulation &&
          (openResult ? (
            <DetailView
              result={openResult}
              profile={PROFILES.find((p) => p.id === openResult.profileId)}
              onClose={handleClose}
            />
          ) : (
            <Results
              results={simulation.results}
              ranked={simulation.ranked}
              profiles={PROFILES}
              onOpen={setOpenId}
              onDownload={handleDownload}
            />
          ))}
      </main>
      <footer className="site-footer">
        <p>
          Vendor names are used only to describe the systems being simulated. No data leaves this
          page.
        </p>
      </footer>
    </div>
  );
}
