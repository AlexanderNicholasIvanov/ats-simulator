// Generates the resume fixtures in tests/fixtures/ used by the extraction tests.
//
// Usage (from the repo root):  node scripts/make-fixtures.mjs
//
// Needs the devDependencies `pdf-lib` and `docx`. The generated files are committed, so this only has to be
// re-run when the fixtures change. Every person, employer and contact detail here is FICTIONAL
// (example.com addresses, 555-01xx phone numbers).
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  Document,
  Header,
  HeadingLevel,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from 'docx';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'tests', 'fixtures');
mkdirSync(OUT, { recursive: true });

// US Letter in PDF points.
const W = 612;
const H = 792;

const NAME = 'Casey Morgan';
const EMAIL = 'casey.morgan@example.com';
const PHONE = '(555) 010-4477';
const LOCATION = 'Portland, OR';

const SUMMARY =
  'Backend software engineer with 7 years of experience building Python and Go services, managing cloud infrastructure on AWS and leading small teams.';

const JOBS = [
  {
    title: 'Senior Software Engineer - Cascade Data Co',
    dates: 'Jan 2021 - Present',
    bullets: [
      '- Led a team of 3 engineers building Python data pipelines on AWS.',
      '- Cut infrastructure cost by 30% with Terraform and Kubernetes.',
    ],
  },
  {
    title: 'Software Engineer - Willamette Logistics',
    dates: '06/2017 - 12/2020',
    bullets: [
      '- Built Go REST APIs serving 2M requests per day.',
      '- Introduced CI/CD with GitHub Actions and automated testing.',
    ],
  },
];

const EDUCATION = ['B.S. Computer Science', 'Riverside State University, 2017'];
const SKILLS = ['Python', 'Go', 'AWS', 'Kubernetes', 'Terraform', 'PostgreSQL'];

/** Lines of the simple single-column resume (also the .txt fixture). */
function simpleLines() {
  return [
    NAME,
    `${EMAIL} | ${PHONE} | ${LOCATION}`,
    '',
    'Summary',
    SUMMARY,
    '',
    'Experience',
    ...JOBS.flatMap((j) => [j.title, j.dates, ...j.bullets, '']),
    'Education',
    ...EDUCATION,
    '',
    'Skills',
    SKILLS.join(', '),
  ];
}

/** Draws text with y measured from the TOP of the page (baseline). */
function draw(page, font, text, x, yTop, size = 10) {
  if (text) page.drawText(text, { x, y: H - yTop, size, font, color: rgb(0, 0, 0) });
}

async function newPdf(title) {
  const pdf = await PDFDocument.create();
  pdf.setTitle(title);
  pdf.setAuthor('ATS Simulator fixtures (fictional)');
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const page = pdf.addPage([W, H]);
  return { pdf, font, bold, page };
}

async function save(pdf, name) {
  // Fixed dates keep the output byte-stable between runs.
  pdf.setCreationDate(new Date('2026-01-01T00:00:00Z'));
  pdf.setModificationDate(new Date('2026-01-01T00:00:00Z'));
  writeFileSync(join(OUT, name), await pdf.save({ useObjectStreams: false }));
  console.log(`wrote ${name}`);
}

const HEADINGS = new Set(['Summary', 'Experience', 'Education', 'Skills']);

async function simplePdf() {
  const { pdf, font, bold, page } = await newPdf('Casey Morgan - Resume');
  let y = 72;
  for (const line of simpleLines()) {
    const isHeading = HEADINGS.has(line) || line === NAME;
    const size = line === NAME ? 16 : 10;
    // The summary is long: split it over two full-width lines.
    if (line === SUMMARY) {
      const words = SUMMARY.split(' ');
      const half = Math.ceil(words.length / 2);
      draw(page, font, words.slice(0, half).join(' '), 50, y);
      y += 14;
      draw(page, font, words.slice(half).join(' '), 50, y);
      y += 14;
      continue;
    }
    draw(page, isHeading ? bold : font, line, 50, y, size);
    y += line === NAME ? 20 : 14;
  }
  await save(pdf, 'resume-simple.pdf');
}

async function twoColumnPdf() {
  const { pdf, font, bold, page } = await newPdf('Casey Morgan - Resume (two columns)');
  // Left sidebar: x 40..200. Right main column: x 250..580. Gutter roughly 200..250.
  const left = [
    [NAME, bold, 14],
    [EMAIL, font, 9],
    [PHONE, font, 9],
    [LOCATION, font, 9],
    ['', font, 9],
    ['Skills', bold, 11],
    ...SKILLS.map((s) => [s, font, 9]),
    ['', font, 9],
    ['Education', bold, 11],
    [EDUCATION[0], font, 9],
    ['Riverside State University', font, 9],
    ['2017', font, 9],
  ];
  const right = [
    ['Summary', bold, 11],
    ['Backend software engineer with 7 years of experience', font, 10],
    ['building Python and Go services and leading small teams.', font, 10],
    ['', font, 10],
    ['Experience', bold, 11],
    ...JOBS.flatMap((j) => [
      [j.title, bold, 10],
      [j.dates, font, 10],
      ...j.bullets.map((b) => [b, font, 10]),
      ['', font, 10],
    ]),
  ];
  let y = 72;
  for (const [text, f, size] of left) {
    draw(page, f, text, 40, y, size);
    y += 15;
  }
  y = 72;
  for (const [text, f, size] of right) {
    draw(page, f, text, 250, y, size);
    y += 15;
  }
  await save(pdf, 'resume-two-column.pdf');
}

async function headerContactPdf() {
  const { pdf, font, bold, page } = await newPdf('Casey Morgan - Resume (header contact)');
  // Top 5% of the page is y < 39.6pt from the top.
  draw(page, bold, NAME, 50, 20, 12);
  draw(page, font, `${EMAIL} | ${PHONE}`, 50, 34, 9);
  let y = 90;
  for (const line of simpleLines().slice(3)) {
    if (line === SUMMARY) {
      draw(page, font, 'Backend software engineer with 7 years of experience building Python and Go services.', 50, y);
    } else {
      draw(page, HEADINGS.has(line) ? bold : font, line, 50, y);
    }
    y += 14;
  }
  await save(pdf, 'resume-header-contact.pdf');
}

async function imageOnlyPdf() {
  const { pdf, page } = await newPdf('Scanned resume (no text)');
  page.drawRectangle({ x: 50, y: 400, width: 300, height: 200, color: rgb(0.6, 0.6, 0.6) });
  await save(pdf, 'resume-image-only.pdf');
}

async function docxFixture() {
  const p = (text, opts = {}) => new Paragraph({ children: [new TextRun(text)], ...opts });
  const h = (text) => new Paragraph({ text, heading: HeadingLevel.HEADING_2 });
  const cell = (text) => new TableCell({ children: [p(text)] });
  const doc = new Document({
    creator: 'ATS Simulator fixtures (fictional)',
    title: 'Casey Morgan - Resume',
    sections: [
      {
        headers: { default: new Header({ children: [p(`${EMAIL} | ${PHONE}`)] }) },
        children: [
          new Paragraph({ text: NAME, heading: HeadingLevel.HEADING_1 }),
          p(LOCATION),
          h('Summary'),
          p(SUMMARY),
          h('Experience'),
          ...JOBS.flatMap((j) => [p(j.title), p(j.dates), ...j.bullets.map((b) => p(b))]),
          h('Education'),
          ...EDUCATION.map((e) => p(e)),
          h('Skills'),
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [
              new TableRow({ children: [cell('Python'), cell('Go'), cell('AWS')] }),
              new TableRow({ children: [cell('Kubernetes'), cell('Terraform'), cell('PostgreSQL')] }),
            ],
          }),
        ],
      },
    ],
  });
  writeFileSync(join(OUT, 'resume.docx'), await Packer.toBuffer(doc));
  console.log('wrote resume.docx');
}

function txtFixture() {
  writeFileSync(join(OUT, 'resume.txt'), simpleLines().join('\n') + '\n', 'utf8');
  console.log('wrote resume.txt');
}

await simplePdf();
await twoColumnPdf();
await headerContactPdf();
await imageOnlyPdf();
await docxFixture();
txtFixture();
