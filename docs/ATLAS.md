# NOMI Atlas: Research Breakdown and Design Rationale

Open `atlas/index.html`. It has three parts: **Ask** (cited answers), **Encyclopedia** (living topic pages), and **Nomi**, the AI buddy (bottom right, or Ctrl/⌘ + J).

---

## 1. Phase 1 research: what OpenEvidence actually is

Based on public reporting, October 2026. Secondary sources are flagged.

| Dimension | OpenEvidence | Implication for NOMI |
|---|---|---|
| **Licence** | Proprietary, not open source. NOMI can't and shouldn't copy its code, text or brand | Learn from the **pattern** (answers with inline citations), which is common across the industry (Perplexity, Glass, Doximity GPT) |
| **Business model** | Free for verified clinicians (NPI checks). Revenue mainly from **pharma advertising**, some shown while answers load. Acquired ad-tech startup Amaro (2025) | Gap: some clinicians object to sponsored placements. NOMI positions itself as **unsponsored** |
| **Moat** | **Licensed full text**: NEJM (Feb 2025), JAMA Network (June 2025), and reportedly Wiley, Cochrane, NCCN (dates vary by source) | Can't be matched on day one. NOMI leads with **open sources** (PubMed, PMC OA, ClinicalTrials.gov, DailyMed, MedlinePlus) and labels the access level on every reference |
| **Core UX** | One search box, synthesized answer, inline numbered citations, follow-ups | Adopted. This is the converged pattern |
| **Patient context** | Early. Epic integration with Sutter Health announced 2026. Mostly a standalone app | **NOMI differentiator**: an opt-in patient-context chip, so answers are chart-aware |
| **Audience** | Clinicians only | NOMI: **one evidence base, three reading levels** (clinician, nurse, patient) |
| **Citation accuracy** | A 2026 audit reported no fabricated citations in a large sample (reported by secondary sources, so verify against the journal) | NOMI's bar: no claim without a citation, and "I don't know" when the index doesn't cover it |

Peers considered: **UpToDate** (expert-written topic pages with graded recommendations: adopted for the Encyclopedia), **Wikipedia** (open, linked, visible change history: adopted as "What changed"), **Perplexity** (sources panel next to the answer: adopted), **Duolingo** (bite-size practice: adopted for the buddy's quizzes).

### Sources
- [JAMA multi-year deal with OpenEvidence (Fierce Healthcare)](https://www.fiercehealthcare.com/ai-and-machine-learning/jama-signs-multi-year-deal-openevidence-inform-ai-powered-medical-search)
- [OpenEvidence $210M round announcement](https://patients.openevidence.com/announcements/openevidence-the-fastest-growing-application-for-physicians-in-history-announces-dollar210-million-round-at-dollar35-billion-valuation)
- [Contrary Research: OpenEvidence](https://research.contrary.com/company/openevidence)
- [Sacra: OpenEvidence](https://sacra.com/research/openevidence) · [licensed journal moat](https://sacra.com/chat/h/a220c12b-a090-4c15-9665-2b15326311cd/) · [monetizes physician attention](https://sacra.com/chat/h/3760bd2b-69a3-4e9e-b616-16d821401c10/)
- [OpenEvidence acquires Amaro (Pulse 2.0)](https://pulse2.com/openevidence-buying-ai-advertising-startup-amaro/)
- [Vera Health: OpenEvidence alternatives 2026](https://verahealth.ai/blog/best-openevidence-alternatives-2026) (secondary)
- [Fast.io review](https://www.fast.io/resources/open-evidence-ai-review-2026.md) (secondary)

---

## 2. Magi decision

**The real question:** not "how do we copy OpenEvidence," but "where can a newcomer win against a company with exclusive journal licences and massive distribution?"

**What most people miss:** OpenEvidence's moat isn't its software, which is reproducible. It's **content licences plus physician distribution**. Copying its UI gains nothing and invites legal risk. Its weak points come from its business model: ad funding creates a trust gap, and a clinicians-only search box leaves nurses, patients and the chart unserved.

**Verdict:** compete on **trust, context and audience**, not on content volume.
1. **Unsponsored by policy.** Written down and visible (Sources → evidence policy).
2. **Open sources first**, with an access label on every reference. Licensing comes later, from strength.
3. **Chart-aware answers** with a visible context chip and a "What NOMI can't see" box.
4. **Three reading levels from one evidence base.** Nurses and patients get the same citations.
5. **An encyclopedia that shows its age**: "Checked" dates and a "What changed" timeline.
6. **A buddy that turns reading into action**: teach-back scripts, quizzes, add to handoff.

Confidence: high on 1–4, medium on 6. Buddy engagement needs real-user testing. **What would change this:** if the Epic integration ships broadly with chart context, differentiator 3 narrows, and nurse/patient reach (4) becomes the main wedge.

---

## 3. Build: what's in the prototype

**Ask**
- A hero search with suggested questions. Context-aware suggestions are tagged "Uses Robert's chart."
- A staged reasoning loader instead of loading ads: "Reading chart → Checking AHA 2022 → …"
- The answer: a bold lead line, body text with numbered citations, and a sources panel. Clicking a number highlights its card. Every card shows type (Guideline / RCT / Patient chart) and access (Free to read / Abstract on PubMed).
- A "What NOMI can't see" box, Copy with citations, Add to Bed 12 handoff, Open encyclopedia page, and related questions.
- Unknown questions get an honest "no cited answer" instead of a guess.

**Encyclopedia**
- Serif long-form reading, key points, a guideline recommendations table with **Class and LOE quoted from the guideline** (Class 3: Harm in red), sections, "What changed", related topics, and a reference list with access labels.
- The reading level filters sections: Nurse view shows nursing care and monitoring, and Patient view shows plain language.

**Nomi buddy**
- A friendly orb that blinks and breathes, with an "I'm thinking" state. It **never pops up uninvited**. It shows at most a one-line hint on the button.
- It knows where you are. On an answer: Explain it simpler, What should I monitor?, teach-back script, one-line summary. On a topic: 30-second summary, Quiz me (3 questions with explanations and sources), What changed recently?, teach-back.
- Free-text questions route to cited answers, otherwise "I won't guess."

### Deviations log
| Researched pattern | NOMI choice | Why |
|---|---|---|
| Ads during loading (OpenEvidence) | Reasoning steps during loading | Trust is the product |
| Licensed full text first | Open sources first, access-labelled | Achievable now, and transparent |
| Clinician-only audience | Three reading levels | Nurses and patients are underserved |
| Mascot assistants that interrupt (the Clippy failure) | Summoned-only buddy, with a hint at most | Respects attention under time pressure |
| Static topic pages | "Checked" date and "What changed" timeline | Medicine changes. Show the page's age |

---

## 4. Content integrity
- All cited publications are real and given by journal, year, volume and pages. Recommendation classes are quoted only where verified.
- Access labels are conservative. NEJM/Lancet papers are marked "Abstract on PubMed" even where free versions may exist.
- Doses for emergency treatment are deliberately left to local protocol.
- The patient is fictional.

## 5. Path to production
1. Retrieval over PubMed E-utilities, PMC OA, ClinicalTrials.gov API v2, openFDA/DailyMed, and MedlinePlus Connect.
2. An LLM synthesis step with a **citation-required** output schema: any sentence without a source is dropped.
3. A clinician editorial board signs off on encyclopedia pages, with the "Checked" date tied to that review.
4. FHIR read-only patient context through SMART on FHIR launch, with every field read logged.
5. Measure citation precision (does the source support the claim?) with blinded clinician review before launch.
