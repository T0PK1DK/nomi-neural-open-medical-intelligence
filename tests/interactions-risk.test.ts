import { describe, expect, it } from "vitest";
import { analyzeInteractions, rankSeverity } from "../src/engine/interactions";
import { decompRisk, detectAnomalies, news2Like } from "../src/engine/risk";
import type { Medication, MonitoringPoint } from "../src/types";

const aceSpiron: Medication[] = [
  { name: "Lisinopril", dose: "10 mg", route: "PO", schedule: "daily" },
  { name: "Spironolactone", dose: "25 mg", route: "PO", schedule: "daily" }
];

describe("interactions", () => {
  it("flags ACE inhibitor plus spironolactone and upgrades severity when eGFR is reduced", () => {
    const mild = analyzeInteractions(aceSpiron, { egfr: 80, potassium: 4.2 });
    const ckd = analyzeInteractions(aceSpiron, { egfr: 42, potassium: 4.8 });
    expect(mild[0].severity).toBe("moderate");
    expect(ckd[0].severity).toBe("high");
    expect(ckd[0].modifiers.join(" ")).toMatch(/eGFR/);
  });

  it("detects the triple-whammy", () => {
    const meds: Medication[] = [
      { name: "Lisinopril", dose: "10", route: "PO", schedule: "daily" },
      { name: "Furosemide", dose: "40", route: "IV", schedule: "BID" },
      { name: "Ibuprofen", dose: "400", route: "PO", schedule: "PRN" }
    ];
    const alerts = analyzeInteractions(meds, { egfr: 50 });
    expect(alerts.some((a) => /triple/i.test(a.mechanism))).toBe(true);
    expect(rankSeverity("critical")).toBeGreaterThan(rankSeverity("low"));
  });

  it("returns nothing for an empty regimen", () => {
    expect(analyzeInteractions([], {})).toEqual([]);
  });
});

describe("risk and anomalies", () => {
  it("scores a stable adult lower than a hypotensive febrile adult", () => {
    const stable = news2Like({ rr: 16, spo2: 98, sbp: 128, hr: 72, tempC: 36.8 });
    const sick = news2Like({ rr: 28, spo2: 90, sbp: 88, hr: 124, tempC: 39.1 });
    expect(sick.value).toBeGreaterThan(stable.value);
    expect(sick.band === "high" || sick.band === "critical").toBe(true);
  });

  it("uses robust z-scores so one spike is flagged without rewriting the baseline", () => {
    const series: MonitoringPoint[] = Array.from({ length: 20 }, (_, t) => ({
      t,
      hr: 80,
      rr: 16,
      spo2: 97,
      sbp: 120
    }));
    series[15] = { t: 15, hr: 80, rr: 16, spo2: 84, sbp: 120 };
    const anomalies = detectAnomalies(series);
    expect(anomalies.some((a) => a.metric === "spo2" && a.value === 84)).toBe(true);
  });

  it("raises HF congestion risk with BNP and hypoxia", () => {
    const low = decompRisk({ bnp: 40, spo2: 98, hr: 70, egfr: 80 });
    const high = decompRisk({ bnp: 900, spo2: 90, hr: 112, egfr: 38 });
    expect(high.value).toBeGreaterThan(low.value);
    expect(high.band).not.toBe("low");
  });
});
