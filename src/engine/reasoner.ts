import type {
  DiagnosisModel,
  Finding,
  RankedDiagnosis,
  ReasonerResult
} from "../types";

const LOG_MIN = 1e-12;

export function clampProb(p: number): number {
  return Math.min(1 - 1e-9, Math.max(1e-9, p));
}

export function logit(p: number): number {
  const q = clampProb(p);
  return Math.log(q / (1 - q));
}

export function invLogit(logOdds: number): number {
  if (logOdds > 30) return 1 - 1e-9;
  if (logOdds < -30) return 1e-9;
  return 1 / (1 + Math.exp(-logOdds));
}

export function lrFor(model: DiagnosisModel, finding: Finding): number {
  const row = model.likelihoods[finding.id];
  if (!row || finding.polarity === "unknown") return 1;
  return finding.polarity === "present" ? row.present : row.absent;
}

export function posteriorLogOdds(model: DiagnosisModel, findings: Finding[]): number {
  let lo = logit(model.prior);
  for (const finding of findings) {
    lo += Math.log(Math.max(LOG_MIN, lrFor(model, finding)));
  }
  return lo;
}

function bandFor(dx: Omit<RankedDiagnosis, "band">, rank: number): RankedDiagnosis["band"] {
  if (dx.cannotMiss && dx.posterior >= 0.04) return "cannot-miss";
  if (rank === 0 && dx.posterior >= 0.45) return "strong";
  if (dx.posterior >= 0.18) return "possible";
  return "low";
}

function findingLabel(findings: Finding[], id: string): string {
  return findings.find((f) => f.id === id)?.label ?? id;
}

/**
 * Exact robustness search: enumerate every polarity flip of known findings.
 * Slower than a greedy score, but reports how often the top diagnosis survives
 * missing or contradicted data. n is small (typically ≤ 12).
 */
function bitCount(value: number): number {
  let n = value;
  let count = 0;
  while (n) {
    n &= n - 1;
    count += 1;
  }
  return count;
}

export function observedMask(findings: Finding[]): number {
  const known = findings.filter((f) => f.polarity !== "unknown");
  let mask = 0;
  known.forEach((f, i) => {
    if (f.polarity === "present") mask |= 1 << i;
  });
  return mask;
}

export function enumerateWorlds(
  models: DiagnosisModel[],
  findings: Finding[]
): { topId: string; logOdds: number[]; mask: number }[] {
  const known = findings.filter((f) => f.polarity !== "unknown");
  const n = known.length;
  const worlds = 1 << n;
  const out: { topId: string; logOdds: number[]; mask: number }[] = [];

  for (let mask = 0; mask < worlds; mask++) {
    const variant = findings.map((f) => {
      const idx = known.findIndex((k) => k.id === f.id);
      if (idx < 0) return f;
      return {
        ...f,
        polarity: ((mask >> idx) & 1) === 1 ? "present" : "absent"
      } as Finding;
    });
    const scores = models.map((m) => posteriorLogOdds(m, variant));
    let best = 0;
    for (let i = 1; i < scores.length; i++) {
      if (scores[i] > scores[best]) best = i;
    }
    out.push({ topId: models[best].id, logOdds: scores, mask });
  }
  return out;
}

export function rankDiagnoses(
  models: DiagnosisModel[],
  findings: Finding[],
  options: { thorough?: boolean } = {}
): ReasonerResult {
  const known = findings.filter((f) => f.polarity !== "unknown");
  const missing = findings.filter((f) => f.polarity === "unknown").map((f) => f.label);

  if (models.length === 0 || known.length === 0) {
    return {
      ranked: [],
      mostLikely: null,
      cannotMiss: [],
      confidence: "abstain",
      confidenceWhy: "Insufficient coded findings to update priors. Do not treat the prior list as a diagnosis.",
      missing,
      worldsEvaluated: 0
    };
  }

  const thorough = options.thorough !== false && known.length <= 14;
  const worlds = thorough ? enumerateWorlds(models, findings) : [];
  const worldCount = thorough ? worlds.length : 1;
  const observed = observedMask(findings);

  const rankedBase = models.map((model) => {
    const logOdds = posteriorLogOdds(model, findings);
    const posterior = invLogit(logOdds);
    const drivers = known
      .map((finding) => {
        const flipped: Finding = {
          ...finding,
          polarity: finding.polarity === "present" ? "absent" : "present"
        };
        const without = posteriorLogOdds(
          model,
          findings.map((f) => (f.id === finding.id ? flipped : f))
        );
        return {
          findingId: finding.id,
          label: findingLabel(findings, finding.id),
          deltaLogOdds: logOdds - without
        };
      })
      .sort((a, b) => Math.abs(b.deltaLogOdds) - Math.abs(a.deltaLogOdds));

    const nearby = thorough
      ? worlds.filter((w) => bitCount(w.mask ^ observed) <= 2)
      : [];
    const wins = nearby.filter((w) => w.topId === model.id).length;
    const stability = nearby.length ? wins / nearby.length : Number.NaN;

    return {
      id: model.id,
      name: model.name,
      prior: model.prior,
      posterior,
      logOdds,
      cannotMiss: model.cannotMiss,
      drivers,
      stability,
      nextSteps: model.nextSteps,
      against: model.againstWhen,
      sourceIds: model.sourceIds
    };
  });

  rankedBase.sort((a, b) => b.posterior - a.posterior);

  const ranked: RankedDiagnosis[] = rankedBase.map((dx, i) => ({
    ...dx,
    band: bandFor(dx, i)
  }));

  const mostLikely = ranked[0] ?? null;
  const cannotMiss = ranked.filter((d) => d.cannotMiss && d.posterior >= 0.03);
  const gap = ranked.length > 1 ? ranked[0].posterior - ranked[1].posterior : ranked[0]?.posterior ?? 0;
  const topStability = Number.isFinite(ranked[0]?.stability) ? ranked[0].stability : 1;

  let confidence: ReasonerResult["confidence"] = "moderate";
  let confidenceWhy = "Posterior mass is split; review competing diagnoses and missing data.";

  if (mostLikely && mostLikely.posterior >= 0.55 && gap >= 0.18 && topStability >= 0.6) {
    confidence = "high";
    confidenceWhy =
      "Leading diagnosis has a clear posterior gap and stays first in most Hamming-distance ≤ 2 worlds. Still a draft — confirm at the bedside.";
  } else if (mostLikely && (mostLikely.posterior < 0.22 || gap < 0.05 || (Number.isFinite(topStability) && topStability < 0.4))) {
    confidence = "low";
    confidenceWhy =
      "Nearby finding flips overturn the rank, or the leading posterior is modest. Gather the missing data before acting.";
  }

  if (missing.length >= 4 && (!mostLikely || mostLikely.posterior < 0.4)) {
    confidence = "abstain";
    confidenceWhy = "Too many unknown findings for a stable update. Listed ranks are exploratory only.";
  }

  return {
    ranked,
    mostLikely,
    cannotMiss,
    confidence,
    confidenceWhy,
    missing,
    worldsEvaluated: worldCount
  };
}

export function explainForRole(
  result: ReasonerResult,
  role: "clinician" | "student" | "researcher"
): string {
  if (!result.mostLikely) {
    return result.confidenceWhy;
  }
  const lead = result.mostLikely;
  const pct = Math.round(lead.posterior * 100);
  const drivers = lead.drivers
    .slice(0, 3)
    .map((d) => `${d.label} (${d.deltaLogOdds >= 0 ? "+" : ""}${d.deltaLogOdds.toFixed(2)} log-odds)`)
    .join("; ");

  if (role === "student") {
    return [
      `Working diagnosis (draft): ${lead.name} (~${pct}% posterior from the coded findings).`,
      `This is not a probability of truth — it is the model update after applying likelihood ratios to a prior.`,
      `Largest drivers: ${drivers || "none"}.`,
      result.confidenceWhy,
      result.cannotMiss.length
        ? `Cannot-miss items still on the board: ${result.cannotMiss.map((d) => d.name).join(", ")}.`
        : "No cannot-miss diagnosis currently exceeds the safety threshold."
    ].join(" ");
  }

  if (role === "researcher") {
    return [
      `MAP: ${lead.name} (posterior ${lead.posterior.toFixed(3)}, prior ${lead.prior.toFixed(3)}).`,
      `Robustness worlds evaluated: ${result.worldsEvaluated}; top-rank stability ${(lead.stability * 100 || 0).toFixed(0)}%.`,
      `Log-odds drivers: ${drivers || "n/a"}.`,
      `Cite the attached guideline/trial nodes before treating this as evidence.`
    ].join(" ");
  }

  return [
    `Most consistent with ${lead.name} (posterior ~${pct}%, ${result.confidence} confidence).`,
    drivers ? `Driven by ${drivers}.` : "",
    result.cannotMiss.length
      ? `Do not close the chart without considering: ${result.cannotMiss.map((d) => d.name).join(", ")}.`
      : "",
    result.confidenceWhy
  ]
    .filter(Boolean)
    .join(" ");
}
