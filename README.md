# NOMI — Neural Open Medical Intelligence

Clinician-first demonstration workspace for chart-grounded reasoning, cited answers, medication-safety checks, and auditable copilot drafts.

Open the interactive prototype with `npm install` and `npm run dev`, then visit the local Vite URL. A production-static build is `npm run build`.

## Not medical advice

**NOMI is not medical advice, not a diagnosis, not a treatment recommendation, and not a medical device.** It is a design-and-engineering prototype for demonstration only. It does not replace a licensed clinician, pharmacist, nurse, or institutional protocol. Every insight, differential, interaction flag, monitoring score, and message draft is synthetic or locally computed and must be verified against the patient record, primary sources, and local policy. Human review is required before documentation, orders, prescriptions, billing, or patient communication. Do not use this repository in the care of a real person.

## What this build adds

- Deterministic Bayesian differential with **exact finding-flip robustness** (slower, more complete than a greedy score)
- Three-tier differential: most likely / expanded / cannot-miss
- **Accept / Override / Defer** on generated insights, with an append-only audit log
- Pairwise medication-safety checker with renal and potassium modifiers
- Working copilot (quick vs thorough) grounded in a local evidence catalog
- Interactive knowledge graph (force layout, 220 cooling ticks)
- Roster search, remote-monitoring sparklines, MAD anomaly alerts with acknowledge / escalate
- Review-before-release patient-facing drafts
- Role density: clinician / student / researcher — **no PIN or passcode gate**
- A **downloadable FHIR R4 collection Bundle** (Patient, Condition, Observation, MedicationRequest, AllergyIntolerance). Vitals follow the R4 vital signs profiles (LOINC, UCUM, blood pressure as a panel), references resolve inside the bundle, and tests cover conformance and round-trip import
- Hash routes, command palette (⌘K / Ctrl+K), keyboard-visible graph nodes
- Mobile layout: left/right drawers with a scrim, labelled bottom navigation, 44 px targets, and horizontally scrollable tables
- Vitest coverage for the reasoner, interactions, risk, copilot, search, audit, graph, catalog integrity, and FHIR export

Demo charts use identifiers only (`P-88472`, …). Public copy contains **no personal names**.

## Links

| Resource | URL |
| --- | --- |
| Research notes | [docs/RESEARCH.md](docs/RESEARCH.md) |
| Next-agent handoff | [docs/HANDOFF.md](docs/HANDOFF.md) |
| HL7 FHIR | [https://www.hl7.org/fhir/](https://www.hl7.org/fhir/) |
| FDA CDS software guidance | [https://www.fda.gov/regulatory-information/search-fda-guidance-documents/clinical-decision-support-software](https://www.fda.gov/regulatory-information/search-fda-guidance-documents/clinical-decision-support-software) |
| ClinicalTrials.gov | [https://clinicaltrials.gov/](https://clinicaltrials.gov/) |
| 2022 AHA/ACC/HFSA HF guideline (Ten Points) | [https://www.acc.org/Latest-in-Cardiology/ten-points-to-remember/2022/03/31/14/42/2022-aha-acc-hfsa-guideline-hf](https://www.acc.org/Latest-in-Cardiology/ten-points-to-remember/2022/03/31/14/42/2022-aha-acc-hfsa-guideline-hf) |
| PubMed | [https://pubmed.ncbi.nlm.nih.gov/](https://pubmed.ncbi.nlm.nih.gov/) |
| OpenEvidence | [https://www.openevidence.com/](https://www.openevidence.com/) |
| Glass Health | [https://glass.health/](https://glass.health/) |
| Abridge | [https://www.abridge.com/](https://www.abridge.com/) |
| UpToDate | [https://www.wolterskluwer.com/en/solutions/uptodate](https://www.wolterskluwer.com/en/solutions/uptodate) |

Comparable products were studied for **ideas only**. No vendor code or assets were copied. See [docs/RESEARCH.md](docs/RESEARCH.md).

## Scripts

```bash
npm install
npm test
npm run dev
npm run build
```

CI runs `npm test` and `npm run build` on every push (`.github/workflows/ci.yml`).

## Status

Early concept prototype. Offline catalog only — no live EHR, no model API, and **do not deploy** this as a care tool.
