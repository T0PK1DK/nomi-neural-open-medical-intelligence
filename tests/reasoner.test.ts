import { describe, expect, it } from "vitest";
import { DIAGNOSES } from "../src/data/catalog";
import { PATIENTS } from "../src/data/patients";
import {
  enumerateWorlds,
  explainForRole,
  invLogit,
  logit,
  posteriorLogOdds,
  rankDiagnoses
} from "../src/engine/reasoner";
import type { Finding } from "../src/types";

describe("probability helpers", () => {
  it("logit and invLogit are inverses on (0,1)", () => {
    for (const p of [0.01, 0.2, 0.5, 0.8, 0.99]) {
      expect(invLogit(logit(p))).toBeCloseTo(p, 8);
    }
  });
});

describe("Bayesian ranker", () => {
  it("ranks acute decompensated HF first for P-88472", () => {
    const p = PATIENTS[0];
    const result = rankDiagnoses(DIAGNOSES, p.findings, { thorough: true });
    expect(result.mostLikely?.id).toBe("adhf");
    expect(result.mostLikely!.posterior).toBeGreaterThan(0.4);
    expect(result.confidence).toBe("high");
    expect(result.worldsEvaluated).toBeGreaterThan(100);
    expect(result.mostLikely!.stability).toBeGreaterThan(0.6);
  });

  it("keeps PE as a cannot-miss on the travel-dyspnea case", () => {
    const p = PATIENTS.find((x) => x.id === "P-22019")!;
    const result = rankDiagnoses(DIAGNOSES, p.findings, { thorough: true });
    expect(result.mostLikely?.id).toBe("pe");
    expect(result.cannotMiss.some((d) => d.id === "pe")).toBe(true);
  });

  it("ranks DKA first when gap acidosis and hyperglycemia are present", () => {
    const p = PATIENTS.find((x) => x.id === "P-44108")!;
    const result = rankDiagnoses(DIAGNOSES, p.findings, { thorough: true });
    expect(result.mostLikely?.id).toBe("dka");
  });

  it("ranks sepsis first for the febrile hypotensive adult", () => {
    const p = PATIENTS.find((x) => x.id === "P-77301")!;
    const result = rankDiagnoses(DIAGNOSES, p.findings, { thorough: true });
    expect(result.mostLikely?.id).toBe("sepsis");
  });

  it("does not let a single atypical chest-pain finding outrank cannot-miss ACS entirely", () => {
    const p = PATIENTS.find((x) => x.id === "P-10955")!;
    const result = rankDiagnoses(DIAGNOSES, p.findings, { thorough: true });
    const acs = result.ranked.find((d) => d.id === "acs");
    expect(acs).toBeTruthy();
    expect(result.mostLikely?.id).not.toBe("acs");
  });

  it("abstains when every finding is unknown", () => {
    const findings: Finding[] = [
      { id: "dyspnea", label: "Dyspnea", polarity: "unknown" },
      { id: "fever", label: "Fever", polarity: "unknown" }
    ];
    const result = rankDiagnoses(DIAGNOSES, findings);
    expect(result.confidence).toBe("abstain");
    expect(result.mostLikely).toBeNull();
  });

  it("attributes the largest ADHF driver to elevated BNP on P-88472", () => {
    const p = PATIENTS[0];
    const result = rankDiagnoses(DIAGNOSES, p.findings, { thorough: false });
    const top = result.ranked.find((d) => d.id === "adhf")!;
    expect(top.drivers[0].findingId).toBe("elevated_bnp");
    expect(top.drivers[0].deltaLogOdds).toBeGreaterThan(1);
  });

  it("enumerates 2^n worlds for known findings", () => {
    const findings = PATIENTS[0].findings.filter((f) => f.polarity !== "unknown").slice(0, 5);
    const worlds = enumerateWorlds(DIAGNOSES.slice(0, 3), findings);
    expect(worlds.length).toBe(32);
    expect(worlds.every((w) => DIAGNOSES.some((d) => d.id === w.topId))).toBe(true);
  });

  it("explains more for students than clinicians", () => {
    const result = rankDiagnoses(DIAGNOSES, PATIENTS[0].findings, { thorough: false });
    const student = explainForRole(result, "student");
    const clinician = explainForRole(result, "clinician");
    expect(student.length).toBeGreaterThan(clinician.length);
    expect(student).toMatch(/likelihood ratios/i);
  });

  it("updates log-odds when a finding polarity flips", () => {
    const model = DIAGNOSES.find((d) => d.id === "adhf")!;
    const present: Finding[] = [{ id: "elevated_bnp", label: "BNP", polarity: "present" }];
    const absent: Finding[] = [{ id: "elevated_bnp", label: "BNP", polarity: "absent" }];
    expect(posteriorLogOdds(model, present)).toBeGreaterThan(posteriorLogOdds(model, absent));
  });
});
