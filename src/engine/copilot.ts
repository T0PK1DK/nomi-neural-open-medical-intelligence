import { DIAGNOSES, SOURCES, sourceById } from "../data/catalog";
import type { CopilotMode, CopilotReply, Patient, Role } from "../types";
import { analyzeInteractions } from "./interactions";
import { explainForRole, rankDiagnoses } from "./reasoner";
import { decompRisk, news2Like } from "./risk";

export function detectIntent(question: string): string {
  const q = question.toLowerCase();
  if (!q.trim()) return "empty";
  if (/(what is nomi|disclaimer|not medical|medical device|\bdevice\b)/.test(q)) return "safety";
  if (/(diff|diagnos|most likely|ddx|cannot[- ]miss)/.test(q)) return "differential";
  if (/(interact|drug|potassium|hyperkal|\bmeds?\b)/.test(q)) return "interactions";
  if (/(trial|sglt|emperor|eligibility|evidence grade)/.test(q)) return "trials";
  if (/(monitor|vital|trend|alert|spo2|news)/.test(q)) return "monitoring";
  if (/(source|guideline|cite|pubmed|aha)/.test(q)) return "sources";
  if (/(lab|bnp|trop|creatinine|egfr|anion)/.test(q)) return "labs";
  if (/(next step|plan|echo|diuret)/.test(q)) return "plan";
  return "general";
}

function cite(ids: string[]): string {
  return ids
    .map((id) => sourceById(id))
    .filter(Boolean)
    .map((s) => `${s!.title} (${s!.year}, grade ${s!.grade})`)
    .join("; ");
}

export function answerQuestion(
  question: string,
  patient: Patient,
  role: Role,
  mode: CopilotMode
): CopilotReply {
  const intent = detectIntent(question);
  const result = rankDiagnoses(DIAGNOSES, patient.findings, { thorough: mode === "thorough" });
  const egfr = patient.labs.find((l) => l.id === "egfr")?.value;
  const potassium = patient.labs.find((l) => l.id === "k")?.value;
  const interactions = analyzeInteractions(patient.meds, { egfr, potassium });
  const news = news2Like({
    rr: patient.vitals.rr,
    spo2: patient.vitals.spo2,
    sbp: patient.vitals.bpSys,
    hr: patient.vitals.hr,
    tempC: patient.vitals.tempC
  });

  if (intent === "empty") {
    return {
      text: "Ask about the differential, labs, interactions, sources, or monitoring. Empty questions are ignored.",
      sourceIds: [],
      abstained: true,
      intent
    };
  }

  if (intent === "safety") {
    return {
      text: "NOMI is a demonstration prototype. It is not medical advice, not a diagnosis, and not a medical device. A licensed clinician must review every output. See the banner and README disclaimer.",
      sourceIds: ["fda-cds"],
      abstained: false,
      intent
    };
  }

  if (intent === "differential" || intent === "general" || intent === "plan") {
    if (result.confidence === "abstain") {
      return {
        text: result.confidenceWhy,
        sourceIds: [],
        abstained: true,
        intent,
        worldsEvaluated: result.worldsEvaluated
      };
    }
    const lead = result.mostLikely;
    const ddx = result.ranked
      .slice(0, 4)
      .map((d, i) => `${i + 1}. ${d.name} — ${(d.posterior * 100).toFixed(0)}% (${d.band})`)
      .join("\n");
    const plan = lead?.nextSteps.map((s) => `• ${s}`).join("\n") ?? "• Gather missing findings";
    const extra =
      role === "student"
        ? `\n\nTeaching note: ${patient.teachingPearl}`
        : role === "researcher"
          ? `\n\nResearch: ${patient.trialHints.join(" ")} Worlds evaluated: ${result.worldsEvaluated}.`
          : "";
    return {
      text: `${explainForRole(result, role)}\n\nRanked draft:\n${ddx}\n\nSuggested next information (not orders):\n${plan}${extra}`,
      sourceIds: lead?.sourceIds ?? [],
      abstained: false,
      intent,
      worldsEvaluated: result.worldsEvaluated
    };
  }

  if (intent === "interactions") {
    if (!interactions.length) {
      return {
        text: "No coded pair in the demo formulary matched this regimen. That is not a clearance — the list is incomplete.",
        sourceIds: ["lexi-raas"],
        abstained: true,
        intent
      };
    }
    const body = interactions
      .map(
        (a) =>
          `${a.drugs.join(" + ")} [${a.severity}]\n${a.mechanism}\nManagement: ${a.management}${
            a.modifiers.length ? `\nModifiers: ${a.modifiers.join("; ")}` : ""
          }`
      )
      .join("\n\n");
    return { text: body, sourceIds: ["lexi-raas"], abstained: false, intent };
  }

  if (intent === "labs") {
    const lines = patient.labs
      .map((l) => `${l.name}: ${l.value} ${l.unit} (${l.flag}; ref ${l.refLow}–${l.refHigh})`)
      .join("\n");
    return {
      text: `Keyed observations for ${patient.id}:\n${lines}\n\nFlags are analytic, not diagnoses.`,
      sourceIds: ["fhir-r4", "pubmed-bnp"],
      abstained: false,
      intent
    };
  }

  if (intent === "monitoring") {
    const hf = decompRisk({
      bnp: patient.labs.find((l) => l.id === "bnp")?.value ?? 0,
      spo2: patient.vitals.spo2,
      hr: patient.vitals.hr,
      egfr: egfr ?? 90
    });
    return {
      text: `${news.name}: ${news.value}/${news.max} (${news.band}). ${hf.name}: ${hf.value}/${hf.max} (${hf.band}). Use the Monitoring board to acknowledge anomalies. Scores are educational.`,
      sourceIds: ["ssc-2021"],
      abstained: false,
      intent
    };
  }

  if (intent === "sources" || intent === "trials") {
    const ids = result.mostLikely?.sourceIds ?? SOURCES.slice(0, 3).map((s) => s.id);
    const research = role === "researcher" ? `\n\n${patient.trialHints.join("\n")}` : "";
    return {
      text: `Attached evidence nodes:\n${cite(ids)}${research}`,
      sourceIds: ids,
      abstained: false,
      intent
    };
  }

  return {
    text: "I can only answer from the local catalog and coded findings. Try differential, labs, interactions, or sources.",
    sourceIds: [],
    abstained: true,
    intent
  };
}
