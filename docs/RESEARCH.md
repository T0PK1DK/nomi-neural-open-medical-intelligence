# Comparable product research — NOMI

This note surveys clinician-facing medical AI and clinical decision-support (CDS) products as they appeared in public materials in 2025–2026. Ideas below were used as **feature inspiration only**. No third-party code, visual assets, or copyrighted copy were reused.

**Not medical advice.** This document is a design-research summary for a demonstration prototype. It is not a clinical, regulatory, or procurement recommendation.

## Why this landscape matters

NOMI is a clinician-first prototype: a single surface that combines patient context, cited evidence, a ranked differential, medication-safety checks, remote-monitoring trends, and an auditable copilot. Comparable products usually specialize. The useful pattern is to **borrow one strength from each category** rather than clone any one product.

Two provenance systems showed up repeatedly:

1. **Evidence provenance** — guideline, journal, label, cohort, and update date.
2. **Encounter provenance** — chart field, lab, device observation, or conversation excerpt.

A third pattern was equally consistent: **supervised write-back**. Products generate drafts. A clinician accepts, edits, or rejects before anything becomes a chart note, order, message, or billed document.

## Products reviewed

### OpenEvidence — cited clinical Q&A

- Official site: [https://www.openevidence.com/](https://www.openevidence.com/)
- About: [https://www.openevidence.com/about/](https://www.openevidence.com/about/)
- User guide: [https://www.openevidence.com/user-guide](https://www.openevidence.com/user-guide)
- Models (quick vs deeper consult): [https://www.openevidence.com/user-guide/models](https://www.openevidence.com/user-guide/models)
- Independent overview: [https://pmc.ncbi.nlm.nih.gov/articles/PMC12951846/](https://pmc.ncbi.nlm.nih.gov/articles/PMC12951846/)
- Early evaluation preprint: [https://www.medrxiv.org/content/10.64898/2025.11.29.25341091v1.full](https://www.medrxiv.org/content/10.64898/2025.11.29.25341091v1.full)

**What clinicians use:** natural-language questions at the point of care; answers grounded in peer-reviewed literature and society content; inline citations; a faster consult mode versus a slower, more thorough report mode.

**Borrow:** citation-first answers, a **quick vs thorough** reasoning mode, source cards next to the reply, and abstention when evidence is thin. Do not treat a citation as proof that the synthesis is correct.

### Glass Health — differential plus assessment/plan drafts

- Official site: [https://glass.health/](https://glass.health/)
- Features: [https://glass.health/features](https://glass.health/features)
- SMART on FHIR / EHR notes: [https://glass.health/resources/clinical-ai-api-ehr-integration](https://glass.health/resources/clinical-ai-api-ehr-integration)
- Evidence-based Q&A notes: [https://glass.health/resources/ai-evidence-based-medicine](https://glass.health/resources/ai-evidence-based-medicine)

**What clinicians use:** encounter-context CDS, a structured differential (most likely / expanded / cannot-miss), and draft assessment-and-plan text that a clinician reviews.

**Borrow:** three-tier differential, evidence attached to each item, and a visible **Accept / Override** state on every generated insight.

### Abridge — ambient notes with claim-level provenance

- Official site: [https://www.abridge.com/](https://www.abridge.com/)
- Product: [https://www.abridge.com/product](https://www.abridge.com/product)

**What clinicians use:** conversation capture, structured notes, after-visit summaries, and “linked evidence” that ties a generated sentence back to the source utterance.

**Borrow:** claim-level provenance and **review-before-release** for any outbound patient message. This prototype does not record audio.

### Microsoft Dragon Copilot (successor to Nuance DAX Copilot)

- Official product: [https://www.microsoft.com/en-us/health-solutions/clinical-workflow/dragon-copilot](https://www.microsoft.com/en-us/health-solutions/clinical-workflow/dragon-copilot)
- DAX in Epic announcement: [https://news.nuance.com/2024-01-18-Nuance-Announces-General-Availability-of-DAX-Copilot-Embedded-in-Epic,-Transforming-Healthcare-Experiences-with-Automated-Clinical-Documentation](https://news.nuance.com/2024-01-18-Nuance-Announces-General-Availability-of-DAX-Copilot-Embedded-in-Epic,-Transforming-Healthcare-Experiences-with-Automated-Clinical-Documentation)

**What clinicians use:** ambient documentation, role-specific surfaces, information surfacing from the encounter, and draft letters/summaries.

**Borrow:** role-aware density (clinician vs student vs researcher) and “suggestion, not action” controls. No passcode or PIN gate.

### Epic Cosmos — similar-patient / real-world evidence

- Official site: [https://cosmos.epic.com/](https://cosmos.epic.com/)
- Peer-reviewed description: [https://pmc.ncbi.nlm.nih.gov/articles/PMC13404524/](https://pmc.ncbi.nlm.nih.gov/articles/PMC13404524/)

**What clinicians use:** de-identified, population-scale look-alikes and observational comparisons rather than a chatbot.

**Borrow:** a **similar-cohort** card that shows n, freshness, and uncertainty instead of a single point estimate.

### UpToDate and Lexidrug

- UpToDate: [https://www.wolterskluwer.com/en/solutions/uptodate](https://www.wolterskluwer.com/en/solutions/uptodate)
- Professional suite: [https://www.wolterskluwer.com/en/solutions/uptodate/pro](https://www.wolterskluwer.com/en/solutions/uptodate/pro)
- Lexidrug: [https://www.wolterskluwer.com/en/solutions/uptodate/pro/lexidrug](https://www.wolterskluwer.com/en/solutions/uptodate/pro/lexidrug)
- Interaction academy: [https://www.wolterskluwer.com/en/solutions/uptodate/resources/facts-comparisons/drug-interactions](https://www.wolterskluwer.com/en/solutions/uptodate/resources/facts-comparisons/drug-interactions)

**What clinicians use:** curated topic pages, evidence grades, calculators, and regimen-level interaction analysis with severity plus management.

**Borrow:** evidence-grade badges, interaction **severity + mechanism + management**, and renal-function modifiers.

### DynaMed

- Official site: [https://www.dynamed.com/](https://www.dynamed.com/)
- Comparison write-up: [https://clinicalaireport.com/compare/uptodate-vs-dynamed](https://clinicalaireport.com/compare/uptodate-vs-dynamed)

**Borrow:** scan-first cards, recommendation strength, and an explicit **updated** timestamp on sources.

### VisualDx

- Official site: [https://www.visualdx.com/](https://www.visualdx.com/)

**Borrow:** finding chips that narrow a differential, and a compare-diagnoses view. This prototype does not ship a clinical image library.

### Isabel

- EBSCO product: [https://about.ebsco.com/health-care/products/isabel](https://about.ebsco.com/health-care/products/isabel)
- FAQ: [https://connect.ebsco.com/s/article/Isabel-Frequently-Asked-Questions?language=en_US](https://connect.ebsco.com/s/article/Isabel-Frequently-Asked-Questions?language=en_US)

**Borrow:** a dedicated **cannot-miss** safety net and a “why this is on the list” explanation.

### Nabla and Ambience Healthcare — ambient documentation

- Nabla: [https://www.nabla.com/](https://www.nabla.com/)
- Nabla EHR: [https://www.nabla.com/ehr](https://www.nabla.com/ehr)
- Ambience: [https://www.ambiencehealthcare.com/](https://www.ambiencehealthcare.com/)

**Borrow:** fast review of generated text, editable drafts, and no silent write-back.

### Tempus — multimodal options, not a single answer

- Official site: [https://www.tempus.com/](https://www.tempus.com/)

**Borrow:** ranked options with eligibility notes, confidence boundaries, and trial matching as a **research** surface rather than a treatment order.

### Viz.ai — closed-loop critical alerts

- Official site: [https://www.viz.ai/](https://www.viz.ai/)

**Borrow:** urgency-ranked worklists and **acknowledge / escalate** on monitoring alerts. Separate algorithm finding from clinician diagnosis.

### Biofourmis and Current Health — remote monitoring

- Biofourmis care delivery: [https://biofourmis.com/care-delivery](https://biofourmis.com/care-delivery)
- Current Health / Best Buy Health: [https://www.bestbuyhealth.com/us-en/current-health](https://www.bestbuyhealth.com/us-en/current-health)

**Borrow:** baseline-relative alerts, trend sparklines, device-quality flags, and an owner for each alert.

### Standards and safety references

- HL7 FHIR: [https://www.hl7.org/fhir/](https://www.hl7.org/fhir/)
- FDA clinical decision support software guidance: [https://www.fda.gov/regulatory-information/search-fda-guidance-documents/clinical-decision-support-software](https://www.fda.gov/regulatory-information/search-fda-guidance-documents/clinical-decision-support-software)
- ClinicalTrials.gov: [https://clinicaltrials.gov/](https://clinicaltrials.gov/)
- 2022 AHA/ACC/HFSA heart-failure guideline (Ten Points): [https://www.acc.org/Latest-in-Cardiology/ten-points-to-remember/2022/03/31/14/42/2022-aha-acc-hfsa-guideline-hf](https://www.acc.org/Latest-in-Cardiology/ten-points-to-remember/2022/03/31/14/42/2022-aha-acc-hfsa-guideline-hf)
- PubMed: [https://pubmed.ncbi.nlm.nih.gov/](https://pubmed.ncbi.nlm.nih.gov/)

## UX references used for layout (not medical products)

These screens informed information density and chrome only. No assets were copied.

- Perplexity Health overview / history and persistent ask bar — [Mobbin flow](https://mobbin.com/flows/6254f53f-fda6-4fe9-8bc8-28a1f0dfe4df)
- Heidi structured note + review-before-release — [Mobbin flow](https://mobbin.com/flows/d4e79e3b-5c1f-4d83-b096-98006a1590b7)
- Cited-answer + sources column patterns — [ChatGPT screen](https://mobbin.com/screens/73833b79-1dd5-4354-8fc4-a2e99c33a75e), [Gemini Notebook screen](https://mobbin.com/screens/e5ced159-147b-4772-bb7b-78d83dba09ef)

## What NOMI implemented from this research

| Idea | Source pattern | NOMI implementation |
| --- | --- | --- |
| Inline citations + source cards | OpenEvidence, Glass | Copilot replies cite a local evidence catalog |
| Quick vs thorough reasoning | OpenEvidence models | Copilot mode toggle; thorough mode runs full robustness enumeration |
| Most likely / expanded / cannot-miss | Glass, Isabel | Dashboard differential is three-tier |
| Accept / Override | Ambient scribes | Every insight and outbound draft is supervised |
| Interaction severity + management | Lexidrug | Pairwise regimen checker with renal modifiers |
| Similar-cohort card | Cosmos | Synthetic look-alike n + uncertainty |
| Baseline-relative monitoring | Biofourmis, Current Health | Sparklines + MAD/z-score anomalies |
| Closed-loop alerts | Viz.ai | Acknowledge / escalate on the monitoring board |
| Role-aware density | Dragon Copilot | Clinician / Student / Researcher (no PIN) |
| FHIR-shaped chart chips | Glass SMART on FHIR | Read-only Observation / Condition / MedicationRequest chips |
| Knowledge as a graph | Tempus-style linking | Interactive force graph: findings ↔ diagnoses ↔ sources |
| Persistent disclaimer | Perplexity Health, product ToS | Banner + footer on every view |

## Explicit non-goals

- Not a medical device and not FDA-cleared.
- Not connected to a live EHR, FHIR server, or literature API.
- No passcode, PIN, or lock-screen gate.
- No personal names in the demo roster or public copy.
- No copied vendor UI, icons, or marketing language.

## Disclaimer (recommended product copy)

NOMI provides demonstration decision-support for design and engineering exploration. It is **not medical advice**, not a diagnosis, and not a treatment recommendation. It is not a substitute for a licensed clinician, pharmacist, or institutional protocol. Verify every output against primary sources, the patient record, and local policy. Human review is required before documentation, orders, prescriptions, billing, or patient communication.
