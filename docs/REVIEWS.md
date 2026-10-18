# NOMI v2: Stakeholder Reviews

> **What these are:** structured heuristic walkthroughs of the prototype, each written from one stakeholder's point of view. **They are simulated expert reviews, not feedback from real users.** They are meant to surface risks before real usability testing. Validate them with real people (see "Next step" at the end).

Each review uses a 1–5 scale on five criteria: **Clarity**, **Speed**, **Trust**, **Safety**, **Fit for role**.

---

## 1. The establishment: hospital leadership, CMIO and clinical governance

**Lens:** liability, auditability, regulatory posture, adoption cost, alert fatigue.

| Clarity | Speed | Trust | Safety | Fit |
|---|---|---|---|---|
| 4 | 4 | 5 | 4 | 4 |

**What works**
- The **decision log** is the strongest feature for governance. It records every AI suggestion and every human action, with person, time, optional reason and a basis snapshot (model version + evidence index date), and it exports to JSON. That is the record a quality committee or medicolegal review needs.
- **Human-in-the-loop is explicit.** "NOMI suggests. You decide." appears at first use. The family page is shown as *released by* a named physician.
- Separating **chart data from literature** in citations makes clear which claims come from the record and which are inferences.
- The **"Not in the chart"** box limits overreach and fits a clinical decision support posture.

**Concerns**
- Override reasons are **optional**. Governance may want them mandatory for high-alert medications. Make this a configurable policy, not the default.
- A **regulatory classification statement** (e.g., FDA CDS guidance / EU MDR status) and model card should be reachable from the provenance footer.
- **Exporting** the log needs role-based permissions and PHI handling in production.

**Ask:** Add an admin view of override rates by recommendation type. That is how the institution learns where NOMI is wrong.

---

## 2. Doctor: hospitalist on a 16-patient census

**Lens:** time to decision, cognitive load, trust calibration, clicks.

| Clarity | Speed | Trust | Safety | Fit |
|---|---|---|---|---|
| 5 | 4 | 5 | 5 | 5 |

**What works**
- "Needs attention" leads with the **one thing I'd act on before 09:00**: potassium rising on an MRA + ACE inhibitor. *Review* jumps straight to the decision.
- **For / Against / Unknowns / What would change this** is how I reason anyway. It is faster to check than a paragraph of prose.
- Accept and Override **feel the same**. One tap, Undo, optional reason. I don't feel punished for disagreeing.
- Flat troponin is shown as **chronic injury, not ACS**, with UDMI cited. That avoids a reflexive cardiology consult.
- `1–6` and `/` shortcuts. Compact density shows more per screen.

**Concerns**
- I want **trend graphs I can expand** (tap a sparkline → 7-day chart with doses overlaid). Today it opens the record only.
- Suggestions should show **what's already ordered** so I don't accept a duplicate.
- The SGLT2 answer is correct but long. Lead with a one-line verdict in bold. It does this, but keep it consistent across all answers.

---

## 3. Nurse: charge nurse, 4 West, night shift

**Lens:** handoff safety, task timing, escalation clarity, interruptions.

| Clarity | Speed | Trust | Safety | Fit |
|---|---|---|---|---|
| 5 | 4 | 4 | 5 | 5 |

**What works**
- Switching to **Nurse lands on Shift handoff**, which is what I open first.
- **I-PASS** structure: severity (Watcher), a timed action list I can tick, and **if/then contingencies** with explicit call parameters. Sign-off goes to the log.
- "Clarify spironolactone with prescriber" keeps me in scope. It doesn't tell me to hold a medicine without an order.
- Print works for a paper backup during downtime.

**Concerns**
- **Edit mode** is a single toggle. I'd like per-section edits and a visible "changed by" marker on NOMI-drafted text vs. my edits.
- Add **I/O totals and fall-risk / skin scores** to the handoff. They are nursing-owned data.
- Call parameters are written per patient. They must **pull from actual orders**, not be generated, or they will drift from what the prescriber ordered.

---

## 4. Caretaker: family member, 70s, uses a tablet occasionally

**Lens:** can I understand it, can I read it, does it scare me, what do I do next?

| Clarity | Speed | Trust | Safety | Fit |
|---|---|---|---|---|
| 5 | 5 | 4 | 4 | 4 |

**What works**
- **Large text by default** in Family view. Short sentences. No numbers I don't understand.
- "It does not mean the heart has stopped" answers the question I'm too scared to ask.
- **"How you can help"** gives me something to do. The salt-substitute tip is specific and useful.
- **"Questions you might ask"** makes it easier to talk to the doctor.
- It's clear **who wrote it and when** ("Reviewed and shared by Dr. Morgan, today at 08:15").

**Concerns**
- The **role switcher** is visible to me. In production, family access must be a separate, authenticated, view-only entry point. A family member should never be able to tap "Physician."
- I'd like a **read-aloud** button and a **translate** option.
- The patient banner still shows the MRN, which means nothing to me. Hide it in Family view.

---

## Summary

| Stakeholder | Avg | Top fix |
|---|---|---|
| Establishment | 4.2 | Configurable mandatory override reasons for high-alert meds. Regulatory/model card link |
| Doctor | 4.8 | Show existing orders on suggestions. Expandable trends |
| Nurse | 4.6 | Call parameters sourced from orders. Track human vs. AI edits in handoff |
| Caretaker | 4.4 | Separate authenticated family entry. Read-aloud, translate, hide MRN |

**Next step:** Run 5 moderated sessions per role (20 total) with think-aloud on three tasks:
1. "Find out why NOMI flagged spironolactone and decide."
2. "Hand off this patient."
3. (Family) "Tell me what's happening and what you'd ask the doctor."

Measure time-to-decision, override rate and SUS. Recruit at least 2 participants aged 65+ and 2 with low digital literacy.
