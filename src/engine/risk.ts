import type { Anomaly, MonitoringPoint, RiskScore, Severity } from "../types";

export function news2Like(input: {
  rr: number;
  spo2: number;
  sbp: number;
  hr: number;
  tempC: number;
}): RiskScore {
  const components: { label: string; points: number }[] = [];
  const add = (label: string, points: number) => {
    if (points) components.push({ label, points });
  };

  add(
    "Respiratory rate",
    input.rr <= 8 ? 3 : input.rr <= 11 ? 1 : input.rr <= 20 ? 0 : input.rr <= 24 ? 2 : 3
  );
  add("SpO₂", input.spo2 <= 91 ? 3 : input.spo2 <= 93 ? 2 : input.spo2 <= 95 ? 1 : 0);
  add("Systolic BP", input.sbp <= 90 ? 3 : input.sbp <= 100 ? 2 : input.sbp <= 110 ? 1 : 0);
  add(
    "Heart rate",
    input.hr <= 40 ? 3 : input.hr <= 50 ? 1 : input.hr <= 90 ? 0 : input.hr <= 110 ? 1 : input.hr <= 130 ? 2 : 3
  );
  add(
    "Temperature",
    input.tempC <= 35 ? 3 : input.tempC <= 36 ? 1 : input.tempC <= 38 ? 0 : input.tempC <= 39 ? 1 : 2
  );

  const value = components.reduce((s, c) => s + c.points, 0);
  const band: Severity = value >= 7 ? "critical" : value >= 5 ? "high" : value >= 3 ? "moderate" : "low";
  return { name: "Early-warning (NEWS2-like demo)", value, max: 15, band, components };
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function mad(xs: number[]): number {
  const m = median(xs);
  return median(xs.map((x) => Math.abs(x - m))) || 1e-6;
}

/**
 * Robust z-scores via median absolute deviation. Slower than a running
 * threshold, but resists a single wild point resetting the baseline.
 */
export function detectAnomalies(series: MonitoringPoint[]): Anomaly[] {
  if (series.length < 8) return [];
  const metrics: Anomaly["metric"][] = ["hr", "rr", "spo2", "sbp"];
  const out: Anomaly[] = [];

  for (const metric of metrics) {
    const values = series.map((p) => p[metric]);
    const med = median(values);
    const scale = 1.4826 * mad(values);
    values.forEach((value, index) => {
      const z = (value - med) / scale;
      const abs = Math.abs(z);
      if (abs < 3.2) return;
      const worseLow = metric === "spo2" || metric === "sbp";
      const direction = value < med ? "below" : "above";
      if (worseLow && value > med && abs < 4) return;
      out.push({
        metric,
        index,
        value,
        z,
        message: `${metric.toUpperCase()} ${value} is ${direction} the personal baseline (robust z ${z.toFixed(1)}).`,
        severity: abs >= 4.5 ? "high" : "moderate"
      });
    });
  }

  return out.sort((a, b) => Math.abs(b.z) - Math.abs(a.z));
}

export function decompRisk(input: { bnp: number; spo2: number; hr: number; egfr: number }): RiskScore {
  const components = [
    { label: "BNP burden", points: input.bnp >= 800 ? 3 : input.bnp >= 400 ? 2 : input.bnp >= 200 ? 1 : 0 },
    { label: "Oxygenation", points: input.spo2 < 92 ? 3 : input.spo2 < 95 ? 1 : 0 },
    { label: "Heart rate", points: input.hr >= 110 ? 2 : input.hr >= 95 ? 1 : 0 },
    { label: "eGFR", points: input.egfr < 30 ? 2 : input.egfr < 45 ? 1 : 0 }
  ].filter((c) => c.points);
  const value = components.reduce((s, c) => s + c.points, 0);
  const band: Severity = value >= 6 ? "high" : value >= 3 ? "moderate" : "low";
  return { name: "HF congestion (demo)", value, max: 10, band, components };
}
