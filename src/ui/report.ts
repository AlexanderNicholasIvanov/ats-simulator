import type { Report } from '../types.ts';

export const REPORT_FILE_NAME = 'ats-simulation-report.json';

/** Save the report as a local JSON file. Nothing leaves the browser. */
export function downloadReport(report: Report): void {
  const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = REPORT_FILE_NAME;
  link.style.display = 'none';
  document.body.appendChild(link);
  try {
    link.click();
  } finally {
    link.remove();
    // Revoke on the next tick so every browser has started the download first.
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}
