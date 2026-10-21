import type { InteractionAlert, Medication, Severity } from "../types";

interface PairRule {
  a: string;
  b: string;
  severity: Severity;
  mechanism: string;
  management: string;
}

const RULES: PairRule[] = [
  {
    a: "lisinopril",
    b: "spironolactone",
    severity: "moderate",
    mechanism: "Dual RAAS blockade raises hyperkalemia and creatinine risk, especially with reduced GFR.",
    management: "Check potassium and creatinine; avoid NSAIDs; review indication for both agents."
  },
  {
    a: "lisinopril",
    b: "potassium chloride",
    severity: "high",
    mechanism: "ACE inhibitor plus potassium supplementation.",
    management: "Hold the supplement unless a documented deficit exists; recapture K+."
  },
  {
    a: "warfarin",
    b: "amiodarone",
    severity: "high",
    mechanism: "CYP2C9 / CYP3A inhibition increases INR.",
    management: "Empiric warfarin reduction and frequent INR if both are required."
  },
  {
    a: "metformin",
    b: "contrast",
    severity: "moderate",
    mechanism: "Iodinated contrast plus metformin in AKI risk settings.",
    management: "Hold around contrast if eGFR is reduced; restart after renal recovery."
  },
  {
    a: "ibuprofen",
    b: "lisinopril",
    severity: "moderate",
    mechanism: "NSAID plus ACE inhibitor can worsen GFR (triple-whammy if a diuretic is also present).",
    management: "Prefer acetaminophen; monitor creatinine if an NSAID is unavoidable."
  },
  {
    a: "furosemide",
    b: "gentamicin",
    severity: "high",
    mechanism: "Loop diuretic plus aminoglycoside ototoxicity / volume contraction.",
    management: "Avoid combination when possible; monitor levels and volume."
  },
  {
    a: "insulin",
    b: "levofloxacin",
    severity: "moderate",
    mechanism: "Fluoroquinolones can disturb glucose.",
    management: "Increase glucose checks while the antibiotic is active."
  },
  {
    a: "sertraline",
    b: "tramadol",
    severity: "high",
    mechanism: "Serotonergic overlap; seizure and serotonin-toxicity risk.",
    management: "Choose a non-serotonergic analgesic if pain treatment is required."
  }
];

function norm(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9 +]/g, "");
}

function has(meds: Medication[], token: string): Medication | undefined {
  return meds.find((m) => norm(m.name).includes(token));
}

export function analyzeInteractions(
  meds: Medication[],
  context: { egfr?: number; potassium?: number }
): InteractionAlert[] {
  const alerts: InteractionAlert[] = [];
  const seen = new Set<string>();

  for (const rule of RULES) {
    const left = has(meds, rule.a);
    const right = has(meds, rule.b);
    if (!left || !right) continue;
    const key = [rule.a, rule.b].sort().join("|");
    if (seen.has(key)) continue;
    seen.add(key);

    const modifiers: string[] = [];
    let severity = rule.severity;
    if ((context.egfr ?? 90) < 45 && (rule.a === "lisinopril" || rule.b === "lisinopril")) {
      modifiers.push(`eGFR ${context.egfr} mL/min — renal clearance reduced`);
      if (severity === "moderate") severity = "high";
    }
    if ((context.potassium ?? 4) >= 5 && key.includes("spironolactone")) {
      modifiers.push(`Serum K+ ${context.potassium} mmol/L`);
      severity = "high";
    }

    alerts.push({
      drugs: [left.name, right.name],
      severity,
      mechanism: rule.mechanism,
      management: rule.management,
      modifiers
    });
  }

  const ace = has(meds, "lisinopril") || has(meds, "enalapril") || has(meds, "ramipril");
  const loop = has(meds, "furosemide") || has(meds, "bumetanide");
  const nsaid = has(meds, "ibuprofen") || has(meds, "naproxen");
  if (ace && loop && nsaid) {
    alerts.push({
      drugs: [ace.name, loop.name, nsaid.name],
      severity: "high",
      mechanism: "ACE inhibitor + diuretic + NSAID (triple whammy) — high AKI risk.",
      management: "Stop the NSAID; recheck creatinine and potassium within 24–48 hours.",
      modifiers: context.egfr ? [`eGFR ${context.egfr}`] : []
    });
  }

  alerts.sort((a, b) => rankSeverity(b.severity) - rankSeverity(a.severity));
  return alerts;
}

export function rankSeverity(s: Severity): number {
  return { low: 1, moderate: 2, high: 3, critical: 4 }[s];
}
