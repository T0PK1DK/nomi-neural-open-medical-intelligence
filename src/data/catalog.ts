import type { DiagnosisModel, Source } from "../types";

export const SOURCES: Source[] = [
  {
    id: "aha-hf-2022",
    title: "2022 AHA/ACC/HFSA Guideline for the Management of Heart Failure",
    kind: "guideline",
    publisher: "AHA / ACC / HFSA",
    year: 2022,
    grade: "A",
    url: "https://www.acc.org/Latest-in-Cardiology/ten-points-to-remember/2022/03/31/14/42/2022-aha-acc-hfsa-guideline-hf",
    summary: "Class I GDMT, congestion assessment, and careful diuretic titration in reduced GFR."
  },
  {
    id: "esc-hf-2023",
    title: "Focused update of the ESC heart-failure guideline",
    kind: "guideline",
    publisher: "ESC",
    year: 2023,
    grade: "A",
    url: "https://www.escardio.org/Guidelines",
    summary: "SGLT2 inhibitors across HF phenotypes; sequential nephron blockade notes."
  },
  {
    id: "chest-acs-2025",
    title: "Chest-pain and ACS evaluation pathway (demo digest)",
    kind: "guideline",
    publisher: "AHA / ACC digest",
    year: 2025,
    grade: "A",
    url: "https://www.acc.org/",
    summary: "Troponin kinetics, ECG, and cannot-miss ischemia framing."
  },
  {
    id: "idsa-cap-2019",
    title: "Diagnosis and Treatment of Adults with Community-acquired Pneumonia",
    kind: "guideline",
    publisher: "ATS / IDSA",
    year: 2019,
    grade: "A",
    url: "https://www.idsociety.org/practice-guideline/community-acquired-pneumonia-cap-in-adults/",
    summary: "CAP vs HF overlap; fever, infiltrate, and procalcitonin context."
  },
  {
    id: "esc-pe-2019",
    title: "ESC pulmonary embolism guideline (digest)",
    kind: "guideline",
    publisher: "ESC",
    year: 2019,
    grade: "A",
    url: "https://www.escardio.org/Guidelines",
    summary: "Wells / revised Geneva, D-dimer, and CTPA when pretest is not low."
  },
  {
    id: "ada-dka-2024",
    title: "Hyperglycemic crises in adults — consensus digest",
    kind: "guideline",
    publisher: "ADA / ACE",
    year: 2024,
    grade: "A",
    url: "https://diabetesjournals.org/",
    summary: "DKA: anion gap, ketones, fluids, insulin, potassium."
  },
  {
    id: "ssc-2021",
    title: "Surviving Sepsis Campaign hour-1 bundle (digest)",
    kind: "guideline",
    publisher: "SSC",
    year: 2021,
    grade: "A",
    url: "https://www.sccm.org/SurvivingSepsisCampaign",
    summary: "Lactate, cultures, antibiotics, fluids, and source control."
  },
  {
    id: "emperor-preserved",
    title: "EMPEROR-Preserved — empagliflozin in HFpEF",
    kind: "trial",
    publisher: "NEJM",
    year: 2021,
    grade: "A",
    url: "https://www.nejm.org/doi/full/10.1056/NEJMoa2107038",
    summary: "SGLT2 reduced HF hospitalization in preserved EF."
  },
  {
    id: "dapa-hf",
    title: "DAPA-HF — dapagliflozin in HFrEF",
    kind: "trial",
    publisher: "NEJM",
    year: 2019,
    grade: "A",
    url: "https://www.nejm.org/doi/full/10.1056/NEJMoa1911303",
    summary: "SGLT2 reduced worsening HF and cardiovascular death in reduced EF."
  },
  {
    id: "pubmed-bnp",
    title: "Natriuretic peptides for acute dyspnea (review digest)",
    kind: "review",
    publisher: "PubMed indexed",
    year: 2023,
    grade: "B",
    url: "https://pubmed.ncbi.nlm.nih.gov/",
    summary: "BNP/NT-proBNP help separate cardiac from non-cardiac dyspnea; cut-points are age-sensitive."
  },
  {
    id: "lexi-raas",
    title: "ACE inhibitor + potassium-sparing diuretic (label-style digest)",
    kind: "label",
    publisher: "Demo formulary",
    year: 2024,
    grade: "B",
    url: "https://www.wolterskluwer.com/en/solutions/uptodate/pro/lexidrug",
    summary: "Hyperkalemia risk rises when GFR is reduced."
  },
  {
    id: "fhir-r4",
    title: "HL7 FHIR R4 resources used as chart chips",
    kind: "standard",
    publisher: "HL7",
    year: 2019,
    grade: "expert",
    url: "https://www.hl7.org/fhir/",
    summary: "Read-only Patient, Condition, Observation, MedicationRequest, AllergyIntolerance."
  },
  {
    id: "fda-cds",
    title: "FDA Clinical Decision Support Software guidance",
    kind: "standard",
    publisher: "FDA",
    year: 2022,
    grade: "expert",
    url: "https://www.fda.gov/regulatory-information/search-fda-guidance-documents/clinical-decision-support-software",
    summary: "Intended-use labeling, transparency, and when software may be a device."
  }
];

export const DIAGNOSES: DiagnosisModel[] = [
  {
    id: "adhf",
    name: "Acute decompensated heart failure",
    prior: 0.07,
    cannotMiss: false,
    likelihoods: {
      dyspnea: { present: 3.4, absent: 0.35 },
      elevated_bnp: { present: 6.5, absent: 0.2 },
      edema: { present: 2.8, absent: 0.55 },
      history_cad: { present: 1.8, absent: 0.85 },
      ckd: { present: 1.4, absent: 0.9 },
      mild_troponin: { present: 1.6, absent: 0.85 },
      fever: { present: 0.35, absent: 1.15 },
      leukocytosis: { present: 0.45, absent: 1.1 },
      infiltrate: { present: 0.5, absent: 1.1 },
      chest_pain: { present: 0.8, absent: 1.05 },
      hypoxia: { present: 1.7, absent: 0.7 },
      tachycardia: { present: 1.3, absent: 0.85 },
      hypotension: { present: 1.2, absent: 0.95 },
      hyperglycemia: { present: 1.0, absent: 1.0 },
      anion_gap: { present: 0.7, absent: 1.05 },
      lactate: { present: 1.1, absent: 0.95 },
      d_dimer: { present: 1.0, absent: 1.0 }
    },
    nextSteps: [
      "Bedside volume exam and daily weights",
      "Echocardiogram if no recent EF / wall-motion study",
      "Careful loop-diuretic titration given eGFR",
      "Repeat potassium if ACE inhibitor + mineralocorticoid antagonist"
    ],
    againstWhen: ["High fever with focal infiltrate", "Clear lungs plus normal BNP"],
    sourceIds: ["aha-hf-2022", "esc-hf-2023", "emperor-preserved", "pubmed-bnp"]
  },
  {
    id: "acs",
    name: "Acute coronary syndrome",
    prior: 0.05,
    cannotMiss: true,
    likelihoods: {
      chest_pain: { present: 4.2, absent: 0.45 },
      mild_troponin: { present: 5.5, absent: 0.25 },
      history_cad: { present: 2.4, absent: 0.75 },
      dyspnea: { present: 1.5, absent: 0.8 },
      elevated_bnp: { present: 1.2, absent: 0.9 },
      diaphoresis: { present: 2.2, absent: 0.8 },
      hypoxia: { present: 1.1, absent: 0.95 },
      tachycardia: { present: 1.3, absent: 0.9 },
      fever: { present: 0.4, absent: 1.1 },
      edema: { present: 0.8, absent: 1.05 }
    },
    nextSteps: [
      "Serial troponin and ECG",
      "Aspirin if no contraindication pending clinician decision",
      "Risk-stratify (HEART / TIMI demo only)"
    ],
    againstWhen: ["Repeatedly undetectable troponin and non-ischemic ECG"],
    sourceIds: ["chest-acs-2025"]
  },
  {
    id: "cap",
    name: "Community-acquired pneumonia",
    prior: 0.05,
    cannotMiss: false,
    likelihoods: {
      fever: { present: 3.8, absent: 0.4 },
      leukocytosis: { present: 2.6, absent: 0.55 },
      infiltrate: { present: 6.0, absent: 0.25 },
      dyspnea: { present: 1.8, absent: 0.7 },
      hypoxia: { present: 1.9, absent: 0.7 },
      elevated_bnp: { present: 0.45, absent: 1.15 },
      chest_pain: { present: 1.3, absent: 0.9 }
    },
    nextSteps: ["Chest imaging if not already done", "Cultures before antibiotics if septic"],
    againstWhen: ["No fever, normal WBC, no infiltrate"],
    sourceIds: ["idsa-cap-2019"]
  },
  {
    id: "pe",
    name: "Pulmonary embolism",
    prior: 0.03,
    cannotMiss: true,
    likelihoods: {
      dyspnea: { present: 2.6, absent: 0.5 },
      tachycardia: { present: 2.4, absent: 0.55 },
      hypoxia: { present: 2.0, absent: 0.65 },
      chest_pain: { present: 1.8, absent: 0.75 },
      d_dimer: { present: 3.4, absent: 0.2 },
      fever: { present: 0.6, absent: 1.05 },
      elevated_bnp: { present: 1.2, absent: 0.9 },
      infiltrate: { present: 0.6, absent: 1.05 }
    },
    nextSteps: ["Document pretest probability", "D-dimer or definitive imaging per pathway"],
    againstWhen: ["PERC negative and low pretest"],
    sourceIds: ["esc-pe-2019"]
  },
  {
    id: "dka",
    name: "Diabetic ketoacidosis",
    prior: 0.015,
    cannotMiss: true,
    likelihoods: {
      hyperglycemia: { present: 8.0, absent: 0.15 },
      anion_gap: { present: 9.0, absent: 0.12 },
      tachycardia: { present: 1.6, absent: 0.75 },
      dyspnea: { present: 1.4, absent: 0.85 },
      fever: { present: 1.2, absent: 0.95 }
    },
    nextSteps: ["ABG/VBG, ketones, potassium before insulin", "Search for a precipitant"],
    againstWhen: ["Normal glucose and closed gap"],
    sourceIds: ["ada-dka-2024"]
  },
  {
    id: "sepsis",
    name: "Sepsis / occult infection",
    prior: 0.04,
    cannotMiss: true,
    likelihoods: {
      fever: { present: 2.8, absent: 0.55 },
      hypotension: { present: 4.5, absent: 0.5 },
      lactate: { present: 4.0, absent: 0.45 },
      tachycardia: { present: 2.1, absent: 0.6 },
      leukocytosis: { present: 2.0, absent: 0.65 },
      hypoxia: { present: 1.4, absent: 0.85 }
    },
    nextSteps: ["Hour-1 bundle review", "Source hunt (urine, lung, skin, abdomen)"],
    againstWhen: ["Normal lactate, stable BP, no infectious findings"],
    sourceIds: ["ssc-2021"]
  },
  {
    id: "anxiety",
    name: "Non-ischemic chest discomfort / anxiety",
    prior: 0.06,
    cannotMiss: false,
    likelihoods: {
      chest_pain: { present: 1.6, absent: 0.7 },
      mild_troponin: { present: 0.25, absent: 1.25 },
      dyspnea: { present: 1.2, absent: 0.9 },
      tachycardia: { present: 1.3, absent: 0.9 },
      elevated_bnp: { present: 0.3, absent: 1.2 }
    },
    nextSteps: ["Only after cannot-miss ischemia and PE are addressed"],
    againstWhen: ["Any ischemic ECG change or rising troponin"],
    sourceIds: ["chest-acs-2025"]
  }
];

export function sourceById(id: string): Source | undefined {
  return SOURCES.find((s) => s.id === id);
}
