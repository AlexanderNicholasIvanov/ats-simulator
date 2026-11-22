import { useEffect, useRef, useState, type DragEvent, type FormEvent } from 'react';

export interface InputPanelProps {
  file: File | null;
  resumeText: string;
  jd: string;
  busy: boolean;
  onFileChange: (file: File | null) => void;
  onResumeTextChange: (text: string) => void;
  onJdChange: (text: string) => void;
  onLoadSample: () => void;
  onSimulate: () => void;
}

export function InputPanel(props: InputPanelProps) {
  const {
    file,
    resumeText,
    jd,
    busy,
    onFileChange,
    onResumeTextChange,
    onJdChange,
    onLoadSample,
    onSimulate,
  } = props;
  const fileInput = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const canSimulate = !busy && (file !== null || resumeText.trim().length > 0);

  // A file dropped just outside the drop zone would otherwise make the browser open it and
  // lose the page state. Text drags (e.g. into the textareas) are left alone.
  useEffect(() => {
    function blockFileDrop(event: globalThis.DragEvent) {
      if (event.dataTransfer?.types.includes('Files')) event.preventDefault();
    }
    window.addEventListener('dragover', blockFileDrop);
    window.addEventListener('drop', blockFileDrop);
    return () => {
      window.removeEventListener('dragover', blockFileDrop);
      window.removeEventListener('drop', blockFileDrop);
    };
  }, []);

  function clearFile() {
    if (fileInput.current) fileInput.current.value = '';
    onFileChange(null);
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    if (busy) return;
    const dropped = event.dataTransfer.files[0];
    if (dropped) {
      if (fileInput.current) fileInput.current.value = '';
      onFileChange(dropped);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (canSimulate) onSimulate();
  }

  function handleLoadSample() {
    if (fileInput.current) fileInput.current.value = '';
    onLoadSample();
  }

  return (
    <section className="panel input-panel" aria-labelledby="input-heading" aria-busy={busy}>
      <h2 id="input-heading">Your resume and the job</h2>
      <form onSubmit={handleSubmit}>
        <div
          className={dragging ? 'drop-zone dragging' : 'drop-zone'}
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
        >
          <label htmlFor="resume-file">Resume file (PDF, DOCX or TXT, up to 5 MB)</label>
          <input
            id="resume-file"
            ref={fileInput}
            type="file"
            accept=".pdf,.docx,.txt"
            disabled={busy}
            onChange={(event) => onFileChange(event.target.files?.[0] ?? null)}
          />
          <p className="hint">Drop a file here, or choose one with the button.</p>
          {file && (
            <p className="selected-file">
              Selected: <strong>{file.name}</strong>{' '}
              <button type="button" className="link-button" onClick={clearFile} disabled={busy}>
                Clear file
              </button>
            </p>
          )}
        </div>

        <label htmlFor="resume-text">Or paste resume text</label>
        <textarea
          id="resume-text"
          rows={10}
          value={resumeText}
          disabled={busy}
          onChange={(event) => onResumeTextChange(event.target.value)}
        />
        {file && resumeText.trim() && (
          <p className="hint">The selected file is used instead of the pasted text.</p>
        )}

        <label htmlFor="job-description">Job description</label>
        <textarea
          id="job-description"
          rows={8}
          value={jd}
          disabled={busy}
          onChange={(event) => onJdChange(event.target.value)}
        />

        <div className="actions">
          <button type="button" className="secondary" onClick={handleLoadSample} disabled={busy}>
            Load sample
          </button>
          <button type="submit" className="primary" disabled={!canSimulate}>
            {busy ? 'Simulating...' : 'Simulate'}
          </button>
        </div>
      </form>
    </section>
  );
}
