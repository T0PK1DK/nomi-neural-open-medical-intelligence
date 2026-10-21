# Handoff — ready prompt for the next coding agent

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

1. **Evidence catalog quality** — attach a real, public, citation-only digest (titles + URLs you already have in RESEARCH) to each diagnosis driver; add a test that every `sourceIds` entry resolves.
2. **FHIR export** — generate a downloadable Bundle JSON for the focused chart (Patient, Condition, Observation, MedicationRequest) and test round-trip parse. Still read-only, still synthetic.
3. **Cannot-miss coverage tests** — property test: any case with `hypotension + lactate + fever` must keep `sepsis` on the cannot-miss list; any `chest_pain + mild_troponin` must keep `acs`.
4. **Accessibility pass** — axe-core or equivalent in Vitest/jsdom; fix contrast on the amber disclaimer bar if it fails.
5. **Message composer** — let the clinician edit the patient-facing draft before Review & release; persist edits in session state; audit the diff.
6. **Monitoring playback** — scrub the 24-hour trace and recompute NEWS2-like + anomalies at each hour (use the existing series; do not invent a backend).
7. **Graph persistence** — remember selected node in the hash (`#/graph/P-88472?node=adhf`).
8. **i18n-ready strings** — extract UI copy from `src/app.ts` into `src/i18n/en.ts` without changing behavior.

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
| `src/app.ts` | State, hash router, views |

## Research already done

Do not redo `docs/RESEARCH.md` unless a product fact is wrong. Official starting points: OpenEvidence, Glass Health, Abridge, Dragon Copilot, Epic Cosmos, UpToDate / Lexidrug, DynaMed, VisualDx, Isabel, Nabla, Tempus, Viz.ai, Biofourmis, Current Health, HL7 FHIR, FDA CDS guidance. Full links live in that file.
