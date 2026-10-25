# CLAUDE_NEXT — notes for the next agent

**Not medical advice.** NOMI is a demonstration prototype, not a medical device. Do not use it for a real person. Do not deploy it. Do not add a login, PIN, or passcode. Demo charts are identifiers only (`P-88472`, `P-22019`, `P-44108`, `P-77301`, `P-10955`). If you are not sure of a medical code or fact, write NOT SURE instead of guessing.

## What is already on this branch

Jobs 1–4 and 6 from the NOMI master prompt (Part B) are done on `cursor/nomi-jobs-1-6-4a8c`.

1. Lab Observations export `referenceRange` and L / N / H interpretation. Tests in `tests/fhir-r4.test.ts` cover every lab. Older bundles still import.
2. DATA CHANGE: no `Patient.fhir` chip list. `fhirChips()` reads the real export.
3. Every resource has a generated, escaped XHTML `text` narrative.
4. Every screen has loading, Try again, and empty states. 390 px phone does not scroll sideways. Type ≥ 12 px.
6. README, `docs/HANDOFF.md`, and this file match that work.

`npm test` and `npm run build` must stay green. Keep Claude's FHIR export and the existing phone layout.

## Files that matter

| Path | Role |
| --- | --- |
| `src/engine/fhir.ts` | Bundle build / parse / chips / narrative / validator |
| `src/types.ts` | `Lab`, `FhirChip`, `Patient` (no `fhir` field) |
| `src/data/patients.ts` | Synthetic charts |
| `src/app.ts` | Screens, hash router, loading/error/empty |
| `src/styles.css` | Teal/cyan, 12 px floor, 390 px stack |
| `tests/fhir-r4.test.ts` | Range, chips, narrative, older imports |
| `tests/app-states.test.ts` | Screen states |

## Suggested next task

Pick one. Do not invent LOINC codes or a fake performer.

- Map eGFR to `mL/min/{1.73_m2}` only if you also change the chart unit. NOT SURE the demo values used that convention.
- axe-core (or similar) on the rendered shell.
- Let a clinician edit a patient-facing draft before Review & release.

## How to check

```bash
npm test
npm run build
npm run preview
```

Open `#/dashboard/P-88472` through `#/audit/P-88472`. Confirm the disclaimer. On a 390 px width, confirm no sideways page scroll.
