# ATS Simulator

See how popular applicant tracking systems (ATSs) would read your resume. Load a resume (`.pdf`, `.docx`, `.txt` or
pasted text) and, optionally, a job description. For each simulated ATS the app shows:

- what that ATS would extract (contact details, jobs, dates, education, skills, section headings),
- its match score, or for ATSs that do not auto-score, a recruiter "search match" percentage,
- matched and missing keywords from the job description,
- formatting warnings (columns, tables, text boxes, header/footer contact details, unreadable dates, unknown headings).

Live site: https://alexandernicholasivanov.github.io/ats-simulator/

> **Disclaimer:** Simulations are approximations built from public documentation and common recruiter knowledge; not
> affiliated with or endorsed by any ATS vendor.

## Privacy

The app runs entirely in your browser. Your resume and the job description are never uploaded: there is no backend,
no analytics and no third-party scripts. Files are parsed locally (PDF via a bundled pdf.js worker, DOCX via mammoth).

## Simulated ATSs

1. Workday
2. Oracle Taleo
3. iCIMS
4. Greenhouse
5. Lever
6. SAP SuccessFactors
7. SmartRecruiters
8. Jobvite

Vendor names are used descriptively only, to identify which system's publicly described behaviour is being
approximated.

## Running locally

Requires Node.js 22 or newer.

```sh
npm ci
npm run dev
```

Then open http://localhost:5173/ats-simulator/.

## Scripts

| Script               | What it does                                           |
| -------------------- | ------------------------------------------------------ |
| `npm run dev`        | Start the Vite dev server                              |
| `npm run build`      | Type-check the app, then build the static site to `dist/` |
| `npm run preview`    | Serve the production build locally                     |
| `npm test`           | Run the test suite once (Vitest + jsdom)               |
| `npm run test:watch` | Run tests in watch mode                                |
| `npm run lint`       | Lint with ESLint                                       |
| `npm run typecheck`  | Type-check app, tests and config files                 |

## Project layout

```
src/
  types.ts     shared types (the contract between modules)
  extract/     turns a PDF, DOCX, TXT or pasted text into ordered lines + layout info
  parse/       turns lines into a structured resume (contact, jobs, education, skills)
  ats/         ATS profiles and the simulation engine (parser rules, keyword match, scoring)
  ui/          React components
  sample/      fictional sample resume and job description
tests/         unit and component tests; fixtures in tests/fixtures/
```

## How ATS profiles work

Each simulated ATS is a plain data object (`AtsProfile` in `src/types.ts`) describing how that system behaves:

- **parser** - whether it reads page headers/footers, handles multi-column layouts, tables and text boxes, and which
  file formats it prefers;
- **headings** - the section headings it recognises (e.g. "work experience", "employment history");
- **dateFormats** - which date formats it can read (`MM/YYYY`, `Mon YYYY`, `YYYY`, ...);
- **keywordMode** - `exact`, `stemmed` (e.g. "managed" ~ "management") or `synonym` matching;
- **scoring** - `score` (ranks applicants 0-100) or `search-match` (no automatic score; recruiters search by keyword);
- **weights** - how keywords, parsed-field completeness and formatting penalties combine into the score;
- **note** and **basis** - a short description shown on the card and where the behaviour description comes from.

The engine applies the profile's parser rules to the extracted document (for example, dropping header text or reading
two columns line by line), parses the result, and scores it against the job description.

- A `false` parser flag drops (headers/footers, tables, text boxes) or scrambles (columns) those lines and adds a
  warning; a file type outside `preferredFormats` adds an info note.
- A heading-like line not in `headings` is reported as an unknown heading; a date outside `dateFormats` is reported
  as a `date-format` warning.
- Seven fields count towards completeness: name, email, phone, location, a dated job, education, skills.
- For `scoring: 'score'` profiles:

  ```
  score = round(100 × (keywords × matchRatio
                     + completeness × fieldsFound / 7
                     + formatting × (1 − min(1, 0.25 × errors + 0.1 × warnings))))
  ```

  `search-match` profiles report `round(100 × matchRatio)` instead. Without a job description (or with one that has
  no recognisable keywords, which adds a `no-keywords` note) nothing is scored.
- The ranking row orders every ATS by one common outcome, computed the same way whatever the profile's own scoring:
  `0.5 × matchRatio + 0.3 × fieldsFound / 7 + 0.2 × (1 − min(1, 0.25 × errors + 0.1 × warnings))` (without a job
  description the match term is dropped and the other two are renormalised), with ties broken by more fields found,
  then fewer errors, then the default profile order.

### Adding an ATS profile

1. Create `src/ats/profiles/<id>.ts` exporting an `AtsProfile` (the `id` must be kebab-case and unique).
2. Register it in `src/ats/profiles/index.ts`.
3. Run `npm test` - the tests validate every registered profile against the profile schema.

## License

[MIT](LICENSE) - Copyright (c) 2026 Alexander Ivanov
