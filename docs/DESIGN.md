# NOMI v2: Design Rationale

This redesign turns the prototype from a "dark AI dashboard" into a **clinical instrument**. It is calm by default, dense when you ask for it, and every claim can be traced to a source.

---

## 1. The core decision (Magi review)

**The tension.** The brief asks for two things at once. Clinicians want a dense, efficient tool. People of all ages, including those who are not tech-savvy, need it to be simple.

**What most redesigns miss.** Non-expert users rarely fail because a screen has too much on it. They fail on **hidden affordances** (hover-only controls, icon-only buttons, gestures) and on **jargon**. Clinicians fail on **extra clicks and context switches**. So the two groups conflict much less than they seem to.

**Resolution.**
1. **Every control is visible and labelled.** No hover-only actions. No icon-only buttons except Close and Help, and both have accessible names.
2. **Density, text size and plain language are settings, not separate products.** Display → Text size (4 steps), Density (Comfortable/Compact), Theme (Light/Dark/Auto), *Explain medical terms*.
3. **Speed for experts comes from accelerators layered on top**: keyboard shortcuts `1–6`, `/`, `?`, `Esc`. Nobody needs them to use the product.
4. **Role changes the default view, not the underlying truth.** Physician → Overview, Nurse → Shift handoff, Family → a clinician-released plain-language page.

Confidence: high on 1–3. Role-aware defaults (4) should be validated with real users. The *Family* view especially needs a governance decision about who releases content and when.

---

## 2. Research basis (compressed Phase 1)

21st.dev returned generic results for clinical UI. The useful hits were the **`tool-ui/citation`** component (default / inline / stacked citation variants) and **shadcn Hover Card**. The structural decisions below rest on established clinical and accessibility precedents.

| Pattern | Precedent | How NOMI uses it |
|---|---|---|
| Persistent patient banner with allergy and code status | NHS Common User Interface (CUI) *Patient Banner* guidance. Epic "Storyboard" | Sticky banner: name, age, DOB, MRN, location, admission day, **allergy in red with icon**, code status |
| Inline numbered/linked citations on AI claims | OpenEvidence, Perplexity, Abridge "Linked Evidence" | Citation chips sit inline next to each claim and open a provenance drawer |
| Graded recommendations | UpToDate / GRADE. ACC/AHA Class + Level of Evidence | 4-step *evidence strength* meter + verbatim guideline class in the source drawer |
| Structured handoff | I-PASS (Starmer et al., NEJM 2014) | New *Shift handoff* view, drafted by NOMI and edited by a human |
| Plain-language public health content | GOV.UK / NHS content style | *Family view* and the *Explain medical terms* toggle |
| Target size / focus | WCAG 2.2 SC 2.5.8 (24 px min), 2.4.11 Focus Not Obscured | 44 px default targets (36 px compact). 3 px focus ring + cyan halo |

### Deviations log
- **Hover-card citations → click/focus drawer.** The researched hover-card pattern fails touch, keyboard and tremor users. Citations open a drawer that traps focus and returns it on close.
- **Raw confidence % → 4 labelled steps + context.** Instead of "94%", NOMI says *Strong support*, lists what supports and what weakens the call, names what it **can't see**, and says what would change its mind. Percentages invite false precision.
- **Chat-first → instrument-first.** The previous design had a persistent chatbot rail. *Ask NOMI* is now a page you go to on purpose. The default screen is a decision surface, not a conversation.
- **Dark-only → light default, dark optional.** Light themes read better for older eyes and in bright clinical rooms. Dark mode is kept for night shift. The cyan accent is used only where it passes contrast. On light backgrounds the text-safe variant `#0b6e86` is used.

---

## 3. Information architecture

```
Overview (default, physician)
├── Needs attention        ← 3 items max, newest first, each with "Review" jump
├── Leading assessment     ← claim + strength + for/against + unknowns + Accept/Override + provenance
├── Suggested next steps   ← each its own Accept/Override, sources inline
├── Other possibilities    ← collapsed rows; expand for For / Against / Next test
└── Data column            ← Vitals (sparklines), Labs (flags + ranges + trend), Medicines (+ interaction)
Shift handoff (default, nurse)   ← I-PASS, NOMI-drafted, editable, receiver sign-off
Ask NOMI                         ← staged reasoning, sourced answers, feedback
Evidence map                     ← interactive knowledge graph with provenance
Decision log                     ← audit trail, filter, JSON export
My patients                      ← unit roster by I-PASS severity
Family view (family role)        ← clinician-released plain-language summary
```

Progressive disclosure follows one rule: **the answer first, the reasons one tap away, the raw source one more tap away.**

---

## 4. New components and patterns

| Component | What it does | Why it matters |
|---|---|---|
| **Evidence strength meter** | 4 labelled bars (Low / Limited / Moderate / Strong), with an ARIA label | Shows confidence in context. Never colour-only |
| **Citation chip (2 kinds)** | Grey dot = the patient's own chart data (FHIR). Teal book = published literature | You can tell at a glance whether a claim comes from *this patient* or *the literature* |
| **Provenance drawer** | "How NOMI used it" (the claim) + citation + study type + last-checked date. Chart data shows the FHIR resource, LOINC code, timestamps | Every claim can be audited in 1 tap |
| **Unknowns callout** | "Not in the chart (NOMI can't see these)" + "What would change this" | AI that states its blind spots earns calibrated trust |
| **Symmetric decision pair** | Accept and Override are the same size, take one tap each, offer an optional reason for both, show an Undo toast for both, and log both | No friction tax on disagreeing |
| **Decision log** | Time, person, action, reason, and the basis snapshot (model + evidence index). Filterable, exportable | Auditability. The empty state explains what will appear |
| **Staged reasoning loader** | "Reading 14 chart records → Checking guidelines → …" then a collapsible "What NOMI did" | The loading state shows the work instead of a spinner |
| **Severity callout** | Icon + word + colour (Caution / Info / OK / Critical) | WCAG 1.4.1: colour is never the only signal |
| **I-PASS handoff** | Severity radio, editable summary, timed checklist, if/then contingencies, receiver sign-off | Turns the AI draft into a human-owned document |
| **Display popover** | Text size, theme, density, explain-terms. Persists per viewer | One place for every accessibility need |

---

## 5. Accessibility checklist

- Skip link, landmark regions, one `h1` per view. Focus moves to the view heading when you switch pages.
- Everything works by keyboard. The graph nodes are focusable and work with Enter/Space.
- The drawer traps focus and returns it to the trigger. `Esc` closes drawers and popovers.
- Toasts use `aria-live="polite"`. The Ask thread is live.
- Honours `prefers-reduced-motion` and `prefers-color-scheme`.
- Minimum 44 px targets in comfortable density.
- Responsive down to 390 px with no horizontal scroll. Print stylesheet for handoff.

---

## 6. Content integrity

- The **patient is fictional**. All **published sources are real** and cited by journal, year, volume and pages. Guideline classes are quoted only where verified (e.g., AHA/ACC 2022: IV loop diuretics for congestion, Class 1, LOE B-NR. TTE in suspected HF, Class 1, LOE C-LD).
- The previous prototype's PubMed ID (`37894521`) could not be verified, so it was **removed**.
- The drawer always tells the user that summaries are paraphrases and to check the original.
- Free-text questions in *Ask NOMI* get an honest "prototype" reply instead of invented content.

---

## 7. Open questions for the team
1. **Family view governance.** Who releases content, how fast, and does it need patient consent? (Prototype assumes physician release.)
2. **Override reasons.** Optional by design. Some institutions will want them mandatory for certain categories (e.g., high-alert medications). That would bring back a friction tax and should be a deliberate policy choice.
3. **Alert budget.** "Needs attention" is capped at 3 by design. The ranking logic needs clinical validation to avoid alert fatigue.
