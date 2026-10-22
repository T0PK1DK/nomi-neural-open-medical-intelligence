# Handoff — ready prompt for the next coding agent

## 2026-10-22 FHIR follow-ups (branch `claude/nomi-fhir-followups`, built on `claude/nomi-review` / PR #3)

### What shipped
- **Lab ranges and flags in the export.** Lab Observations now carry `referenceRange` (UCUM `low`/`high` when the unit maps, `text` always; text only when it does not) and `interpretation` coded with `v3-ObservationInterpretation` L / N / H. `parseFhirBundle` reads them back into `refLow` / `refHigh` / `flag`; older exports without them still import.
- **Provenance chips derived from the export (data-model change).** The hand-written `Patient.fhir` array is removed. `fhirChips(patient)` in `src/engine/fhir.ts` builds chips from `buildFhirBundle`, so each one names a real `ResourceType/id` in the download and its label is that resource's narrative summary. The dashboard FHIR card renders them (`data-fhir-ref`). Vital-sign Observations are left out of the chip strip only.
- **Narrative on every resource.** `Resource.text` with status `generated` and an escaped one-line XHTML div. Clears every dom-6 warning.
- **Offline FHIR validation in CI.** `scripts/fhir-validate/` holds a HAPI FHIR 7.6.0 harness (DefaultProfileValidationSupport, CommonCodeSystemsTerminologyService, InMemoryTerminologyServerValidationSupport, SnapshotGeneratingValidationSupport; no network terminology). The new `fhir-validate` CI job dumps all five demo charts and fails on any ERROR. The `test-and-build` job is unchanged.

Run it locally (Java 21 + Maven):

```bash
npx vite-node scripts/fhir-validate/dump-bundles.ts scripts/fhir-validate/target/bundles
cd scripts/fhir-validate && mvn -B -q compile exec:java -Dexec.args=target/bundles
```

Validator, all 5 charts: before 0 errors / 194 warnings (86 dom-6 + 108 "observations should have a performer"); after 0 errors / 108 warnings (performer only).

### Skipped and why
- **Observation.performer warnings.** These are synthetic charts with no real performer. Adding a made-up Practitioner/Organization would be invented data, so the best-practice warning stays.
- **No new LOINC codes for labs.** Labs keep the local demo code system; no code was added that was not certain.

### Next
- eGFR is exported with UCUM `mL/min`; the clinically usual unit is `mL/min/{1.73_m2}`. Change the chart unit and the UCUM map together if wanted.
- Overlap: draft PR #4 (`leon/overnight-review`) also edits `src/app.ts` and `src/engine/fhir.ts`. Rebase whichever lands second.


Copy everything under **Prompt** into a new Claude / Cursor session. Do not deploy. Do not add a PIN or passcode gate. Do not put personal names in public copy.

## Prompt

You are continuing work on **NOMI (Neural Open Medical Intelligence)**, a clinician-facing demonstration SPA in this repository. It is **not a medical device** and **not medical advice**.

Read these first, in order:

1. `README.md` — product framing and the required disclaimer
2. `docs/RESEARCH.md` — comparable apps, source links, and which ideas were borrowed
3. `src/types.ts`, `src/engine/*`, `src/data/*`, `src/app.ts`
4. `tests/*.test.ts`

### What is already true

- Vite + TypeScript + Vitest. `npm test` and `npm run build` must stay green.
- The original static `index.html` dashboard had dead Send buttons, empty Patients / Monitoring / Messages views, no routing, and personal names. Those are replaced.
- Differentials come from `rankDiagnoses` in `src/engine/reasoner.ts`. It uses log-odds updates plus **exact 2^n finding-flip enumeration** (prefer this slower, exact robustness search over a greedy heuristic).
- Medication alerts: `src/engine/interactions.ts`. Monitoring anomalies: robust MAD z-scores in `src/engine/risk.ts`.
- Copilot is deterministic and catalog-grounded (`src/engine/copilot.ts`). No network LLM.
- Demo patients are `P-88472`, `P-22019`, `P-44108`, `P-77301`, `P-10955` — identifiers only.
- Roles are clinician / student / researcher. No authentication theater.
- Hash routes: `#/<view>/<patientId>`.
- Accept / Override / Defer and message release write to an in-memory audit log.

### Constraints you must keep

- **Do not deploy** (no Pages, Workers, Vercel, or production hosting).
- **No personal names** in README, docs, UI, commits, or PR text.
- **No passcodes, PINs, lock screens, or fake login walls.**
- Do not copy code or assets from OpenEvidence, Glass, Abridge, Epic, UpToDate, or Mobbin screenshots.
- Keep the not-medical-advice disclaimer on the banner, README, and footer.
- Prefer the more correct algorithm even if it is slower (full robustness worlds, MAD over naive mean, more force-layout ticks).
- Keep tests; add cases when you change the reasoner or formulary.

### Suggested next upgrades (pick one vertical and finish it)

See the 2026-10-21 addendum below. FHIR export, catalog `sourceIds` resolution, cannot-miss coverage cases, and the disclaimer contrast fix are already done.

### How to verify

```bash
npm test
npm run build
npm run dev
```

Exercise in a browser: dashboard Accept/Override, copilot Send, graph node click, roster filter, monitoring acknowledge, message release, audit filter, mobile menu, command palette. Confirm no personal names and no PIN screen.

### Out of scope unless the user asks

Live EHR, real PHI, model APIs, billing, e-prescribing, deployment, authentication, and any claim of clinical safety.

## Current architecture (short)

| Path | Role |
| --- | --- |
| `src/engine/reasoner.ts` | Bayesian rank + robustness worlds |
| `src/engine/interactions.ts` | Pairwise + triple-whammy |
| `src/engine/risk.ts` | NEWS2-like, HF congestion, MAD anomalies |
| `src/engine/copilot.ts` | Intent + cited answers |
| `src/engine/graph.ts` | Force-directed layout |
| `src/engine/audit.ts` | Append-only events |
| `src/engine/search.ts` | Roster + palette |
| `src/data/catalog.ts` | Diagnoses + sources |
| `src/data/patients.ts` | Synthetic charts |
| `src/engine/fhir.ts` | Synthetic FHIR Bundle build / parse |
| `src/app.ts` | State, hash router, views |

## Research already done

Do not redo `docs/RESEARCH.md` unless a product fact is wrong. Official starting points: OpenEvidence, Glass Health, Abridge, Dragon Copilot, Epic Cosmos, UpToDate / Lexidrug, DynaMed, VisualDx, Isabel, Nabla, Tempus, Viz.ai, Biofourmis, Current Health, HL7 FHIR, FDA CDS guidance. Full links live in that file.

---

## 2026-10-21 improvement pass (FHIR export + mobile)

### What landed

- **Feature:** `src/engine/fhir.ts` builds a read-only FHIR R4 `collection` Bundle for the focused chart (Patient + Condition + Observation + MedicationRequest + AllergyIntolerance). Dashboard **Download FHIR bundle** writes `p-#####-fhir-bundle.json`. Identifiers only. `parseFhirBundle` round-trips the slice; tests reject non-Bundle JSON.
- **Bugs:** evidence-rail Send now opens Copilot with the reply; single-point sparklines no longer divide by zero; cannot-miss rows are not duplicated in Most likely / Expanded; triple-whammy alerts list all three drugs; Escape / scrim close the mobile drawers and palette; hash patient changes clear the graph selection; copilot Quick/Thorough show `aria-pressed`.
- **UI / mobile:** high-contrast disclaimer bar; left menu drawer and right evidence drawer with Close; labelled bottom navigation under 760 px; 2-up vital tiles; 44 px primary targets; table overflow wrappers; keyboard-focusable graph nodes.
- **Tests added:** catalog `sourceIds` resolution, cannot-miss coverage for sepsis / ACS, FHIR round-trip for every demo chart.

### Constraints still in force

Do not deploy. No passcodes. No personal names in public copy. No vendor-asset copies. Keep the disclaimer.

### Suggested next upgrades (pick one)

1. **Evidence catalog quality** — attach a real, public, citation-only digest (titles + URLs already in RESEARCH) to each diagnosis driver.
2. **Cannot-miss coverage expansion** — more property cases beyond fever+hypotension+lactate and chest_pain+mild_troponin.
3. **Accessibility pass** — axe-core or equivalent in Vitest/jsdom on the rendered shell.
4. **Message composer** — edit the patient-facing draft before Review & release; persist edits; audit the diff.
5. **Monitoring playback** — scrub the 24-hour trace and recompute NEWS2-like + anomalies at each hour.
6. **Graph persistence** — remember selected node in the hash (`#/graph/P-88472?node=adhf`).
7. **i18n-ready strings** — extract UI copy from `src/app.ts` into `src/i18n/en.ts`.

### Architecture addendum

| Path | Role |
| --- | --- |
| `src/engine/fhir.ts` | Synthetic FHIR Bundle build / parse / filename |
