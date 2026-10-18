# NOMI — Neural Open Medical Intelligence

**Clinician-first neural intelligence layer for the medical field.**

NOMI is a concept for an AI-native system that integrates patient data (FHIR), live medical literature, guidelines, clinical trials, and biology knowledge into a single transparent, evidence-grounded interface. It helps doctors and nurses reason faster, surface what matters, and reduce information hunting — while remaining fully auditable and under human control.

## Live Prototype

Open `index.html` in a browser to view the interactive clinician dashboard prototype.

### What's in v2
- **Overview**: "Needs attention", leading assessment with evidence strength, for/against, unknowns, and symmetric Accept/Override
- **Suggested next steps**: each one sourced, decidable in one tap, and undoable
- **Provenance drawer**: every claim links to chart data (FHIR) or a real published source
- **Shift handoff**: I-PASS structured, NOMI-drafted, nurse-edited, signed off
- **Ask NOMI**: staged reasoning, cited answers, feedback
- **Evidence map**: interactive knowledge graph
- **Decision log**: full audit trail with export
- **Family view**: clinician-released plain-language summary
- **Display settings**: text size, light/dark, density, "Explain medical terms"

Keyboard: `1–6` pages · `/` ask · `?` help · `Esc` close.

See [`docs/DESIGN.md`](docs/DESIGN.md) for the design rationale and [`docs/REVIEWS.md`](docs/REVIEWS.md) for stakeholder reviews.

## NOMI Care (patient + care team app)

Open `care/index.html`. **The call light, reinvented.** Patients tap what they need, and each request goes to the right person (care assistant, nurse, nutrition, housekeeping). Patients see who's coming and when, like a ride-hailing tracker. Nurses get only clinical requests, each with context: pain score, PRN eligibility, fall risk. Notes are drafted for them to sign, and they can chart by voice. Plain-language results, care-plan-grounded answers, and a discharge readiness checklist. See [`docs/CARE.md`](docs/CARE.md).

## Vision

NOMI aims to be the unifying neural knowledge network for medicine:
- Continuous integration of online medical sources
- Patient-context-aware reasoning
- Transparent provenance and citations on every output
- Easy override and human-in-the-loop design
- Support for clinicians, patients, students, and researchers

## Design Principles
- Evidence and citations are first-class
- Confidence with context, not raw percentages
- Override as easy as accept
- Role-specific density (dense for clinicians, calm for patients)
- Transparent and auditable

## Status
Early concept prototype. Not a medical device. For demonstration and design exploration only.

---

**Neural Open Medical Intelligence** — connecting knowledge so clinicians can focus on care.
