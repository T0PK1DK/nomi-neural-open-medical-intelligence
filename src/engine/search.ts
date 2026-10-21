import { PATIENTS } from "../data/patients";
import { SOURCES } from "../data/catalog";
import type { Patient, Source } from "../types";

export interface SearchHit {
  kind: "patient" | "source" | "command";
  id: string;
  title: string;
  blurb: string;
  score: number;
}

const COMMANDS = [
  { id: "dashboard", title: "Open dashboard", blurb: "Patient intelligence" },
  { id: "copilot", title: "Open copilot", blurb: "Cited Q&A" },
  { id: "graph", title: "Open knowledge graph", blurb: "Findings ↔ evidence" },
  { id: "patients", title: "Open roster", blurb: "All demo charts" },
  { id: "monitoring", title: "Open monitoring", blurb: "Trends and alerts" },
  { id: "messages", title: "Open messages", blurb: "Review-before-release" },
  { id: "audit", title: "Open audit log", blurb: "Accept / override history" }
];

function haystack(parts: string[]): string {
  return parts.join(" ").toLowerCase();
}

function scoreText(query: string, text: string): number {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return 0;
  let score = 0;
  for (const term of terms) {
    if (text.includes(term)) score += 3;
    else if (text.split(/[\s,/]+/).some((w) => w.startsWith(term))) score += 1;
  }
  return score;
}

export function searchAll(query: string): SearchHit[] {
  const q = query.trim();
  if (!q) return [];
  const hits: SearchHit[] = [];

  for (const p of PATIENTS) {
    const text = haystack([
      p.id,
      p.mrn,
      p.chiefConcern,
      p.unit,
      p.sex,
      String(p.ageYears),
      p.teachingPearl,
      ...p.problems,
      ...p.notes,
      ...p.labs.map((l) => l.name)
    ]);
    const score = scoreText(q, text);
    if (score) {
      hits.push({
        kind: "patient",
        id: p.id,
        title: `${p.id} · ${p.ageYears}y ${p.sex}`,
        blurb: p.chiefConcern,
        score
      });
    }
  }

  for (const s of SOURCES) {
    const text = haystack([s.id, s.title, s.publisher, s.kind, s.summary]);
    const score = scoreText(q, text);
    if (score) {
      hits.push({
        kind: "source",
        id: s.id,
        title: s.title,
        blurb: `${s.kind} · ${s.year} · grade ${s.grade}`,
        score
      });
    }
  }

  for (const c of COMMANDS) {
    const score = scoreText(q, haystack([c.id, c.title, c.blurb]));
    if (score) hits.push({ kind: "command", id: c.id, title: c.title, blurb: c.blurb, score });
  }

  return hits.sort((a, b) => b.score - a.score).slice(0, 12);
}

export function filterPatients(list: Patient[], query: string, unit: string): Patient[] {
  return list.filter((p) => {
    if (unit && p.unit !== unit) return false;
    if (!query.trim()) return true;
    return scoreText(
      query,
      haystack([
        p.id,
        p.chiefConcern,
        p.unit,
        p.mrn,
        p.teachingPearl,
        ...p.problems,
        ...p.notes,
        ...p.labs.map((l) => l.name)
      ])
    ) > 0;
  });
}

export function sourceCatalog(): Source[] {
  return SOURCES;
}
