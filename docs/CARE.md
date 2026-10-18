# NOMI Care: The call light, reinvented

Open `care/index.html`. On desktop you see two phones linked live. On a phone you get one app with a Patient / Care team switch at the top.

## The problem we're actually solving

NOMI Care doesn't try to replace nurses. It takes away **the parts of the job that aren't nursing**, and it fixes **the parts of being a patient that feel like being ignored**.

| Worst part today | Who suffers | What NOMI Care does |
|---|---|---|
| A call light is a single bit: "someone wants something." The RN walks in to find the patient wanted water | Nurse | The request is **typed and routed**: water, toileting, repositioning and temperature go to the care assistant. Food goes to nutrition. Cleaning goes to housekeeping. Only clinical items reach the RN |
| The RN walks in blind and goes back to look up the PRN interval | Nurse | Each card **arrives with context**: pain score, location, PRN order, last dose, "eligible now" or the next allowed time, fall risk, fluid limit, relevant labs |
| Typing notes after every interaction | Nurse | On **Done**, a note is drafted from the request and the orders. Or the nurse dictates, and NOMI structures it, matches "Tylenol" to the active order, and waits for a **signature**. Nothing is filed without one |
| Pressing the call light and hearing nothing back | Patient | **Live tracker**: Sent → Delivered → On the way (~ETA) → Done, with the person's name, shown in the Dynamic Island |
| Results arrive with no explanation (common patient-portal complaint) | Patient | Plain-language note, range bar, and trend. **The patient chooses** whether to see results right away or after review |
| "When can I have more pain medicine?" | Both | Answered instantly **from the patient's own orders**, with a source line. If NOMI can't answer from the care plan, it routes the question to the RN instead of guessing |
| Unclear discharge plan | Patient | **Going home** checklist (visit within 7 days, meds teach-back, scale at home, ride) and green/yellow/red symptom zones |

## Safety rails (non-negotiable)
- Anything clinical goes to an RN. **"I feel worse"** asks 3 red-flag questions. Any "yes" becomes an urgent alert, and the patient is told to press the red bed button too.
- Chest pain selected in the pain flow is escalated as urgent.
- Fall-risk patients asking for bathroom help are told to **stay in bed**, and the reason is explained.
- The app adds to the nurse call system. It never replaces it. The red call button always works.
- Charting drafts are never filed without the nurse's signature. Gaps the AI can't fill are marked `[Add your findings]`.

## Design language
- **Patient app: Apple-calm.** System font (SF on Apple devices), large titles that collapse into the nav bar, inset grouped lists, bottom sheets with drag-to-dismiss, Dynamic Island status, fluid and readiness rings. Light and dark follow the system. An **Aa** button cycles text size (Dynamic Type).
- **Care team app: mission control.** Dark, monospaced telemetry labels, a clinical-priority queue, and urgent cards with an alarm pulse. One primary action per card: **On my way → Done**.
- Brand: deep teal `#0A4D68` with cyan `#22d3ee`. Cyan is used for live state only.

## Where content comes from
- Fluid limit, PRN interval, fall risk: patient **orders** (fictional patient).
- Pain scale: 0–10 numeric rating scale. The copyrighted Wong-Baker FACES scale is deliberately not reproduced.
- Home weight thresholds (2–3 lb/day, 5 lb/week): American Heart Association patient guidance, with "your doctor may give you different numbers."
- 7-day follow-up after a heart failure hospitalization: 2022 AHA/ACC/HFSA guideline.
- Counts on the Shift tab are from the demo session only. No time-savings figures are claimed.

## Reviews (simulated stakeholder walkthroughs, not real user feedback)
- **Nurse:** "The pain card answers my first three questions before I stand up. Routing water to Maya is the feature. I'd want the unit to own the routing rules, and the 'Done' note must never auto-file." 5/5
- **Patient (68, low tech confidence):** "Big buttons, my nurse's name, and I can see she's coming. The water button told me how much I'm allowed, which nobody had explained." 5/5
- **Care assistant:** Needs their own queue view with room-order batching. *Not built yet*
- **Hospital leadership:** Wants routing analytics by request type, and integration with the existing nurse call vendor and EHR (FHIR `ServiceRequest` / `Task` / `Communication`). *Next step*

## Next
1. CNA and housekeeping queue apps.
2. Integration with nurse call systems through their vendor APIs. Map requests to FHIR `Task`.
3. Usability testing with 65+ patients and night-shift nurses. Measure call-light-to-arrival time and RN interruptions per hour.
