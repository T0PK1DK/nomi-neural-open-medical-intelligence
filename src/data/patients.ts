import type { Finding, FindingPolarity, MonitoringPoint, Patient } from "../types";

function f(id: string, label: string, polarity: FindingPolarity): Finding {
  return { id, label, polarity };
}

function series(seed: number, base: Omit<MonitoringPoint, "t">, bump?: { at: number; patch: Partial<MonitoringPoint> }): MonitoringPoint[] {
  const out: MonitoringPoint[] = [];
  let x = seed;
  const rand = () => {
    x = (x * 1664525 + 1013904223) >>> 0;
    return (x & 0xffff) / 0xffff;
  };
  for (let i = 0; i < 24; i++) {
    const point: MonitoringPoint = {
      t: i,
      hr: Math.round(base.hr + (rand() - 0.5) * 8),
      rr: Math.round(base.rr + (rand() - 0.5) * 3),
      spo2: Math.round((base.spo2 + (rand() - 0.5) * 2) * 10) / 10,
      sbp: Math.round(base.sbp + (rand() - 0.5) * 10)
    };
    if (bump && i === bump.at) Object.assign(point, bump.patch);
    out.push(point);
  }
  return out;
}

export const PATIENTS: Patient[] = [
  {
    id: "P-88472",
    ageYears: 68,
    sex: "male",
    unit: "Cardiology step-down",
    admitHoursAgo: 46,
    mrn: "88472-19",
    chiefConcern: "Progressive dyspnea and orthopnea",
    problems: ["CAD", "CKD stage 3", "HFpEF (prior)"],
    allergies: ["No known drug allergies"],
    meds: [
      { name: "Lisinopril", dose: "10 mg", route: "PO", schedule: "daily" },
      { name: "Spironolactone", dose: "25 mg", route: "PO", schedule: "daily" },
      { name: "Furosemide", dose: "40 mg", route: "IV", schedule: "BID" },
      { name: "Atorvastatin", dose: "40 mg", route: "PO", schedule: "nightly" }
    ],
    vitals: { bpSys: 128, bpDia: 76, hr: 82, rr: 20, spo2: 94, tempC: 36.7, weightKg: 92 },
    labs: [
      { id: "bnp", name: "BNP", value: 832, unit: "pg/mL", refLow: 0, refHigh: 100, flag: "high" },
      { id: "trop", name: "Troponin I", value: 0.04, unit: "ng/mL", refLow: 0, refHigh: 0.03, flag: "high" },
      { id: "cr", name: "Creatinine", value: 1.6, unit: "mg/dL", refLow: 0.6, refHigh: 1.2, flag: "high" },
      { id: "egfr", name: "eGFR", value: 42, unit: "mL/min", refLow: 60, refHigh: 120, flag: "low" },
      { id: "k", name: "Potassium", value: 4.8, unit: "mmol/L", refLow: 3.5, refHigh: 5.1, flag: "normal" },
      { id: "wbc", name: "WBC", value: 7.2, unit: "K/µL", refLow: 4, refHigh: 11, flag: "normal" }
    ],
    findings: [
      f("dyspnea", "Dyspnea", "present"),
      f("elevated_bnp", "Elevated BNP", "present"),
      f("edema", "Peripheral edema", "present"),
      f("history_cad", "History of CAD", "present"),
      f("ckd", "CKD stage 3", "present"),
      f("mild_troponin", "Mild troponin rise", "present"),
      f("hypoxia", "SpO₂ ≤ 94%", "present"),
      f("fever", "Fever", "absent"),
      f("leukocytosis", "Leukocytosis", "absent"),
      f("infiltrate", "Focal infiltrate", "absent"),
      f("chest_pain", "Ischemic chest pain", "absent"),
      f("tachycardia", "Sustained tachycardia", "absent")
    ],
    series: series(11, { hr: 82, rr: 20, spo2: 94, sbp: 128 }, { at: 19, patch: { spo2: 89, rr: 26 } }),
    notes: [
      "Orthopnea for 3 nights. No fever. Home weight +3.1 kg.",
      "Last echo 11 months ago: EF 55%, mild LVH, no severe valve disease."
    ],
    threads: [
      {
        id: "m1",
        subject: "Echo slot — morning list",
        audience: "care-team",
        unread: true,
        needsReview: false,
        body: "Portable echo requested. Draft indication: dyspnea, BNP 832, possible ADHF. Not sent until the attending confirms."
      },
      {
        id: "m2",
        subject: "After-visit wording (patient-facing draft)",
        audience: "patient-draft",
        unread: false,
        needsReview: true,
        draft:
          "We are treating fluid overload and watching kidney function and potassium. This draft is not medical advice and must be reviewed before release."
      }
    ],
    fhir: [
      { resourceType: "Patient", id: "P-88472", label: "Adult 68y · male" },
      { resourceType: "Condition", id: "cond-hf", label: "I50.9 Heart failure, unspecified (working)" },
      { resourceType: "Observation", id: "obs-bnp", label: "BNP 832 pg/mL" },
      { resourceType: "MedicationRequest", id: "med-ace", label: "Lisinopril 10 mg daily" },
      { resourceType: "AllergyIntolerance", id: "alg-nkda", label: "NKDA" }
    ],
    similar: {
      label: "Adults 65–75 with BNP 600–1000 and eGFR 30–50",
      n: 214,
      outcome: "Inpatient diuresis without ICU transfer in 71% (wide interval)",
      interval: "64–77%",
      freshness: "Synthetic cohort · not Cosmos"
    },
    teachingPearl:
      "A natriuretic peptide supports a cardiac cause of dyspnea but does not grade EF. Mild troponin is common in decompensation and does not by itself equal ACS.",
    trialHints: [
      "EMPEROR-Preserved-like eligibility if EF remains ≥40% after congestion improves.",
      "SGLT2 discussion belongs after eGFR and volume are stable — researcher view only."
    ]
  },
  {
    id: "P-22019",
    ageYears: 54,
    sex: "female",
    unit: "Emergency / obs",
    admitHoursAgo: 9,
    mrn: "22019-04",
    chiefConcern: "Sudden dyspnea after a long trip",
    problems: ["Prior VTE (remote)", "Obesity"],
    allergies: ["Iodinated contrast — urticaria"],
    meds: [
      { name: "Norethindrone / ethinyl estradiol", dose: "1 tablet", route: "PO", schedule: "daily" },
      { name: "Sertraline", dose: "50 mg", route: "PO", schedule: "daily" }
    ],
    vitals: { bpSys: 118, bpDia: 74, hr: 112, rr: 24, spo2: 91, tempC: 37.1, weightKg: 98 },
    labs: [
      { id: "ddimer", name: "D-dimer", value: 1.8, unit: "mg/L", refLow: 0, refHigh: 0.5, flag: "high" },
      { id: "trop", name: "Troponin I", value: 0.01, unit: "ng/mL", refLow: 0, refHigh: 0.03, flag: "normal" },
      { id: "bnp", name: "BNP", value: 62, unit: "pg/mL", refLow: 0, refHigh: 100, flag: "normal" },
      { id: "wbc", name: "WBC", value: 8.4, unit: "K/µL", refLow: 4, refHigh: 11, flag: "normal" },
      { id: "abg", name: "A-a gradient (demo)", value: 28, unit: "mmHg", refLow: 0, refHigh: 20, flag: "high" }
    ],
    findings: [
      f("dyspnea", "Dyspnea", "present"),
      f("tachycardia", "Sustained tachycardia", "present"),
      f("hypoxia", "SpO₂ ≤ 94%", "present"),
      f("d_dimer", "Elevated D-dimer", "present"),
      f("chest_pain", "Pleuritic chest pain", "present"),
      f("fever", "Fever", "absent"),
      f("leukocytosis", "Leukocytosis", "absent"),
      f("infiltrate", "Focal infiltrate", "absent"),
      f("elevated_bnp", "Elevated BNP", "absent"),
      f("mild_troponin", "Mild troponin rise", "absent")
    ],
    series: series(23, { hr: 110, rr: 24, spo2: 91, sbp: 118 }, { at: 8, patch: { spo2: 86, hr: 128 } }),
    notes: ["Contrast allergy documented. V/Q versus alternative imaging is a clinician decision."],
    threads: [
      {
        id: "m3",
        subject: "Imaging pathway (care-team)",
        audience: "care-team",
        unread: false,
        needsReview: false,
        body: "Pretest is not low. Contrast allergy is listed. Draft only — no order placed by NOMI."
      }
    ],
    fhir: [
      { resourceType: "Patient", id: "P-22019", label: "Adult 54y · female" },
      { resourceType: "Condition", id: "cond-pe", label: "Working: PE not excluded" },
      { resourceType: "Observation", id: "obs-dd", label: "D-dimer 1.8 mg/L" },
      { resourceType: "AllergyIntolerance", id: "alg-cx", label: "Iodinated contrast — urticaria" }
    ],
    similar: {
      label: "Adults with tachycardia + hypoxia + travel + raised D-dimer",
      n: 88,
      outcome: "CTPA or V/Q completed same encounter in most synthetic rows",
      interval: "demo only",
      freshness: "Synthetic cohort"
    },
    teachingPearl: "A normal BNP does not rule out PE. Cannot-miss hypoxia plus tachycardia should stay on the board.",
    trialHints: ["Outpatient PE pathways require validated low-risk scores — not computed here."]
  },
  {
    id: "P-44108",
    ageYears: 31,
    sex: "female",
    unit: "Medicine",
    admitHoursAgo: 6,
    mrn: "44108-77",
    chiefConcern: "Polyuria, vomiting, and Kussmaul breathing",
    problems: ["Type 1 diabetes", "Diabetic ketoacidosis (working)"],
    allergies: ["No known drug allergies"],
    meds: [
      { name: "Insulin glargine", dose: "18 units", route: "SQ", schedule: "nightly" },
      { name: "Insulin lispro", dose: "carb ratio 1:10", route: "SQ", schedule: "meals" }
    ],
    vitals: { bpSys: 104, bpDia: 62, hr: 118, rr: 28, spo2: 98, tempC: 37.4, weightKg: 61 },
    labs: [
      { id: "glu", name: "Glucose", value: 428, unit: "mg/dL", refLow: 70, refHigh: 99, flag: "high" },
      { id: "ag", name: "Anion gap", value: 22, unit: "mmol/L", refLow: 6, refHigh: 12, flag: "high" },
      { id: "k", name: "Potassium", value: 5.3, unit: "mmol/L", refLow: 3.5, refHigh: 5.1, flag: "high" },
      { id: "hco3", name: "Bicarbonate", value: 10, unit: "mmol/L", refLow: 22, refHigh: 28, flag: "low" },
      { id: "wbc", name: "WBC", value: 13.1, unit: "K/µL", refLow: 4, refHigh: 11, flag: "high" }
    ],
    findings: [
      f("hyperglycemia", "Hyperglycemia", "present"),
      f("anion_gap", "Elevated anion gap", "present"),
      f("tachycardia", "Sustained tachycardia", "present"),
      f("dyspnea", "Kussmaul / air hunger", "present"),
      f("fever", "Fever", "absent"),
      f("hypotension", "Hypotension", "absent"),
      f("elevated_bnp", "Elevated BNP", "unknown"),
      f("chest_pain", "Chest pain", "absent")
    ],
    series: series(41, { hr: 118, rr: 28, spo2: 98, sbp: 104 }),
    notes: ["Last pump site change unclear. Look for infection as a precipitant."],
    threads: [
      {
        id: "m4",
        subject: "DKA checklist (care-team)",
        audience: "care-team",
        unread: true,
        needsReview: false,
        body: "Fluids, potassium plan, insulin infusion — clinician-owned. NOMI will not start insulin."
      }
    ],
    fhir: [
      { resourceType: "Patient", id: "P-44108", label: "Adult 31y · female" },
      { resourceType: "Condition", id: "cond-dka", label: "E10.10 Type 1 diabetes with DKA (working)" },
      { resourceType: "Observation", id: "obs-glu", label: "Glucose 428 mg/dL" },
      { resourceType: "MedicationRequest", id: "med-ins", label: "Insulin regimen (home)" }
    ],
    similar: {
      label: "Adults 18–40 with gap acidosis + glucose >350",
      n: 61,
      outcome: "ICU vs floor is a local triage decision — not predicted here",
      interval: "n/a",
      freshness: "Synthetic cohort"
    },
    teachingPearl: "Do not start insulin until potassium is known. The high-normal / high K+ here can fall quickly.",
    trialHints: ["No interventional trial matching in this demo case."]
  },
  {
    id: "P-77301",
    ageYears: 77,
    sex: "female",
    unit: "Medicine",
    admitHoursAgo: 14,
    mrn: "77301-02",
    chiefConcern: "Fever, confusion, and reduced oral intake",
    problems: ["Recurrent UTI", "CKD stage 4", "Frailty"],
    allergies: ["Penicillin — rash"],
    meds: [
      { name: "Levofloxacin", dose: "250 mg", route: "IV", schedule: "daily (renal)" },
      { name: "Insulin glargine", dose: "8 units", route: "SQ", schedule: "nightly" },
      { name: "Acetaminophen", dose: "650 mg", route: "PO", schedule: "q6h PRN" }
    ],
    vitals: { bpSys: 92, bpDia: 54, hr: 108, rr: 22, spo2: 95, tempC: 38.7, weightKg: 54 },
    labs: [
      { id: "wbc", name: "WBC", value: 16.4, unit: "K/µL", refLow: 4, refHigh: 11, flag: "high" },
      { id: "lact", name: "Lactate", value: 2.8, unit: "mmol/L", refLow: 0.5, refHigh: 1.9, flag: "high" },
      { id: "cr", name: "Creatinine", value: 2.4, unit: "mg/dL", refLow: 0.5, refHigh: 1.1, flag: "high" },
      { id: "egfr", name: "eGFR", value: 22, unit: "mL/min", refLow: 60, refHigh: 120, flag: "low" },
      { id: "glu", name: "Glucose", value: 168, unit: "mg/dL", refLow: 70, refHigh: 99, flag: "high" }
    ],
    findings: [
      f("fever", "Fever", "present"),
      f("leukocytosis", "Leukocytosis", "present"),
      f("hypotension", "Hypotension", "present"),
      f("lactate", "Raised lactate", "present"),
      f("tachycardia", "Sustained tachycardia", "present"),
      f("ckd", "CKD", "present"),
      f("dyspnea", "Dyspnea", "absent"),
      f("infiltrate", "Focal infiltrate", "unknown"),
      f("hyperglycemia", "Severe hyperglycemia", "absent")
    ],
    series: series(7, { hr: 108, rr: 22, spo2: 95, sbp: 92 }, { at: 14, patch: { sbp: 78, hr: 122 } }),
    notes: ["Penicillin allergy is rash-only per chart. Source likely urine — confirm culture."],
    threads: [
      {
        id: "m5",
        subject: "Sepsis board (care-team)",
        audience: "care-team",
        unread: true,
        needsReview: false,
        body: "Hour-1 items are a checklist, not orders. Escalate if SBP stays <90 after the first fluid challenge — clinician call."
      }
    ],
    fhir: [
      { resourceType: "Patient", id: "P-77301", label: "Adult 77y · female" },
      { resourceType: "Condition", id: "cond-sep", label: "Sepsis, unspecified organism (working)" },
      { resourceType: "Observation", id: "obs-lac", label: "Lactate 2.8 mmol/L" },
      { resourceType: "AllergyIntolerance", id: "alg-pcn", label: "Penicillin — rash" }
    ],
    similar: {
      label: "Adults ≥70 with fever + lactate ≥2 + SBP <100",
      n: 140,
      outcome: "Source control + antibiotics associated with better synthetic survival — not causal",
      interval: "wide",
      freshness: "Synthetic cohort"
    },
    teachingPearl: "Confusion plus fever in a frail adult is sepsis until the source workup is complete.",
    trialHints: ["Stewardship: fluoroquinolone is a stand-in, not a recommendation."]
  },
  {
    id: "P-10955",
    ageYears: 45,
    sex: "male",
    unit: "Chest-pain obs",
    admitHoursAgo: 5,
    mrn: "10955-33",
    chiefConcern: "Brief atypical chest tightness after lifting",
    problems: ["None listed"],
    allergies: ["No known drug allergies"],
    meds: [{ name: "Ibuprofen", dose: "400 mg", route: "PO", schedule: "PRN" }],
    vitals: { bpSys: 132, bpDia: 80, hr: 72, rr: 14, spo2: 99, tempC: 36.6, weightKg: 81 },
    labs: [
      { id: "trop", name: "Troponin I", value: 0.01, unit: "ng/mL", refLow: 0, refHigh: 0.03, flag: "normal" },
      { id: "bnp", name: "BNP", value: 18, unit: "pg/mL", refLow: 0, refHigh: 100, flag: "normal" },
      { id: "wbc", name: "WBC", value: 6.1, unit: "K/µL", refLow: 4, refHigh: 11, flag: "normal" }
    ],
    findings: [
      f("chest_pain", "Chest tightness", "present"),
      f("mild_troponin", "Mild troponin rise", "absent"),
      f("dyspnea", "Dyspnea", "absent"),
      f("elevated_bnp", "Elevated BNP", "absent"),
      f("fever", "Fever", "absent"),
      f("tachycardia", "Sustained tachycardia", "absent"),
      f("hypoxia", "Hypoxia", "absent"),
      f("history_cad", "Known CAD", "absent")
    ],
    series: series(99, { hr: 72, rr: 14, spo2: 99, sbp: 132 }),
    notes: ["ECG documented as non-ischemic in the paper chart (not imported)."],
    threads: [
      {
        id: "m6",
        subject: "Discharge wording (patient-facing draft)",
        audience: "patient-draft",
        unread: false,
        needsReview: true,
        draft: "Return precautions for chest pain. This is a draft and is not medical advice."
      }
    ],
    fhir: [
      { resourceType: "Patient", id: "P-10955", label: "Adult 45y · male" },
      { resourceType: "Observation", id: "obs-trop", label: "Troponin I 0.01 ng/mL" }
    ],
    similar: {
      label: "Adults 40–50 with non-ischemic ECG + undetectable troponin",
      n: 320,
      outcome: "Short-stay ACS is uncommon in this synthetic slice — still not zero",
      interval: "demo",
      freshness: "Synthetic cohort"
    },
    teachingPearl: "A single undetectable troponin is not a full ACS rule-out if timing is early.",
    trialHints: ["No trial match."]
  }
];

export function patientById(id: string): Patient | undefined {
  return PATIENTS.find((p) => p.id === id);
}
