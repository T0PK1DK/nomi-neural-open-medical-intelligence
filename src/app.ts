import { DIAGNOSES, sourceById } from "./data/catalog";
import { PATIENTS, patientById } from "./data/patients";
import { appendAudit, filterAudit, makeAuditEvent } from "./engine/audit";
import { answerQuestion } from "./engine/copilot";
import {
  buildFhirBundle,
  bundleResourceCounts,
  fhirChips,
  fhirFilename,
  serializeFhirBundle
} from "./engine/fhir";
import { layoutGraph, neighborsOf, type LaidOutNode } from "./engine/graph";
import { analyzeInteractions } from "./engine/interactions";
import { explainForRole, rankDiagnoses } from "./engine/reasoner";
import { decompRisk, detectAnomalies, news2Like } from "./engine/risk";
import { filterPatients, searchAll } from "./engine/search";
import type {
  AlertAction,
  ReasonerResult,
  AuditEvent,
  CopilotMode,
  GraphEdge,
  GraphNode,
  InsightAction,
  Patient,
  Role,
  ViewId
} from "./types";

interface ChatTurn {
  who: "user" | "ai";
  text: string;
  sourceIds: string[];
  abstained?: boolean;
  /** AI turn still being computed. */
  pending?: boolean;
  /** AI turn that failed; `retry` holds the question to ask again. */
  retry?: string;
}

interface State {
  view: ViewId;
  patientId: string;
  role: Role;
  mode: CopilotMode;
  chat: ChatTurn[];
  insight: Record<string, InsightAction>;
  alerts: Record<string, AlertAction>;
  released: string[];
  audit: AuditEvent[];
  commandOpen: boolean;
  commandQuery: string;
  rosterQuery: string;
  rosterUnit: string;
  graphSelected: string | null;
  panelOpen: boolean;
  navOpen: boolean;
  auditQuery: string;
  messageQuery: string;
  lastExport: string | null;
  exportError: string | null;
  copilotBusy: boolean;
}

/** Bottom bar on phones: four primary views plus More, which opens the full menu. */
const MOBILE_PRIMARY: ViewId[] = ["dashboard", "copilot", "patients", "monitoring"];

const VIEWS: { id: ViewId; label: string; short: string }[] = [
  { id: "dashboard", label: "Dashboard", short: "Home" },
  { id: "copilot", label: "AI Copilot", short: "Copilot" },
  { id: "graph", label: "Knowledge graph", short: "Graph" },
  { id: "patients", label: "Patients", short: "Roster" },
  { id: "monitoring", label: "Monitoring", short: "Monitor" },
  { id: "messages", label: "Messages", short: "Inbox" },
  { id: "audit", label: "Audit", short: "Audit" }
];

const TITLES: Record<ViewId, string> = {
  dashboard: "Patient intelligence",
  copilot: "Cited clinical copilot",
  graph: "Neural knowledge graph",
  patients: "Roster",
  monitoring: "Remote monitoring",
  messages: "Secure messages",
  audit: "Audit trail"
};

/** Views whose first paint is a loading card, then the body after one frame. */
const GATED_VIEWS = ["graph", "patients", "monitoring", "messages", "audit"] as const;
type GatedView = (typeof GATED_VIEWS)[number];

const VIEW_LOADING: Record<GatedView, string> = {
  graph: "Laying out the knowledge graph…",
  patients: "Loading the demo roster…",
  monitoring: "Reading the 24-hour traces…",
  messages: "Opening message threads…",
  audit: "Opening the session log…"
};

function isGated(view: ViewId): view is GatedView {
  return (GATED_VIEWS as readonly string[]).includes(view);
}

function errorMessage(err: unknown): string {
  if (err instanceof Error && err.message) return err.message;
  if (typeof err === "string" && err.trim()) return err;
  if (err && typeof err === "object" && "message" in err) {
    const message = (err as { message: unknown }).message;
    if (typeof message === "string" && message.trim()) return message;
  }
  return "Unknown error";
}

/** Map a risk/score band onto the existing badge palette (low = reassuring green). */
function bandBadge(band: string): string {
  if (band === "low") return "high";
  if (band === "moderate") return "med";
  return "low";
}

/** Run `fn` after the browser has painted the current frame, so loading states are visible. */
function afterPaint(fn: () => void): void {
  if (typeof requestAnimationFrame === "function") {
    requestAnimationFrame(() => window.setTimeout(fn, 0));
  } else {
    window.setTimeout(fn, 0);
  }
}

function ago(minutes: number): string {
  if (minutes < 60) return `${minutes} min ago`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h} h ${m} min ago` : `${h} h ago`;
}

const CONFIDENCE_LABEL: Record<ReasonerResult["confidence"], string> = {
  high: "High confidence",
  moderate: "Moderate confidence",
  low: "Low confidence",
  abstain: "Abstaining"
};

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (ch) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]!
  );
}

function parseHash(): { view: ViewId; patientId: string } {
  const raw = location.hash.replace(/^#\/?/, "");
  const [viewRaw, patientRaw] = raw.split("/");
  const view = VIEWS.some((v) => v.id === viewRaw) ? (viewRaw as ViewId) : "dashboard";
  const patientId = patientById(patientRaw ?? "") ? patientRaw : PATIENTS[0].id;
  return { view, patientId };
}

function writeHash(view: ViewId, patientId: string): void {
  const next = `#/${view}/${patientId}`;
  if (location.hash !== next) history.replaceState(null, "", next);
}

function lab(patient: Patient, id: string): number | undefined {
  return patient.labs.find((item) => item.id === id)?.value;
}

function buildGraph(patient: Patient): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const result = rankDiagnoses(DIAGNOSES, patient.findings, { thorough: false });
  const nodes: GraphNode[] = [{ id: patient.id, label: patient.id, kind: "patient" }];
  const edges: GraphEdge[] = [];
  for (const finding of patient.findings.filter((f) => f.polarity !== "unknown")) {
    nodes.push({ id: finding.id, label: finding.label, kind: "finding" });
    edges.push({ from: patient.id, to: finding.id, label: finding.polarity });
  }
  for (const dx of result.ranked.slice(0, 4)) {
    nodes.push({ id: dx.id, label: dx.name, kind: "diagnosis" });
    edges.push({ from: patient.id, to: dx.id, label: `${Math.round(dx.posterior * 100)}%` });
    for (const driver of dx.drivers.slice(0, 3)) {
      if (nodes.some((n) => n.id === driver.findingId)) {
        edges.push({ from: driver.findingId, to: dx.id, label: "updates" });
      }
    }
    for (const sourceId of dx.sourceIds) {
      const source = sourceById(sourceId);
      if (!source) continue;
      if (!nodes.some((n) => n.id === source.id)) {
        nodes.push({
          id: source.id,
          label: source.kind === "trial" ? source.title.slice(0, 28) : source.title.slice(0, 28),
          kind: source.kind === "trial" ? "trial" : "source"
        });
      }
      edges.push({ from: dx.id, to: source.id, label: "cited" });
    }
  }
  for (const med of patient.meds.slice(0, 4)) {
    const id = `drug-${med.name}`;
    nodes.push({ id, label: med.name, kind: "drug" });
    edges.push({ from: patient.id, to: id, label: "rx" });
  }
  return { nodes, edges };
}

function sparkline(values: number[], invert = false): string {
  if (!values.length) return "";
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const yOf = (v: number) => (invert ? ((v - min) / span) * 40 + 4 : 44 - ((v - min) / span) * 40);
  if (values.length === 1) {
    return `<svg class="spark" viewBox="0 0 120 48" preserveAspectRatio="none" aria-hidden="true"><circle cx="60" cy="${yOf(values[0]).toFixed(1)}" r="3.5" fill="#22d3ee"></circle></svg>`;
  }
  const pts = values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * 120;
      return `${x.toFixed(1)},${yOf(v).toFixed(1)}`;
    })
    .join(" ");
  return `<svg class="spark" viewBox="0 0 120 48" preserveAspectRatio="none" aria-hidden="true"><polyline fill="none" stroke="#22d3ee" stroke-width="2" vector-effect="non-scaling-stroke" points="${pts}" /></svg>`;
}

function downloadFhir(patient: Patient): void {
  const blob = new Blob([serializeFhirBundle(buildFhirBundle(patient))], {
    type: "application/fhir+json"
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fhirFilename(patient.id);
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function actionLabel(action: InsightAction | AlertAction): string {
  const labels: Record<string, string> = {
    pending: "pending",
    accepted: "accepted",
    overridden: "overridden",
    deferred: "deferred",
    open: "open",
    acknowledged: "acknowledged",
    escalated: "escalated",
    accept: "accepted",
    override: "overridden",
    defer: "deferred"
  };
  return labels[action] ?? action;
}

export function mount(root: HTMLElement): void {
  const boot = parseHash();
  const state: State = {
    view: boot.view,
    patientId: boot.patientId,
    role: "clinician",
    mode: "thorough",
    chat: [],
    insight: {},
    alerts: {},
    released: [],
    audit: [
      makeAuditEvent("session", "Workspace opened in demonstration mode", "clinician", boot.patientId)
    ],
    commandOpen: false,
    commandQuery: "",
    rosterQuery: "",
    rosterUnit: "",
    graphSelected: null,
    panelOpen: false,
    navOpen: false,
    auditQuery: "",
    messageQuery: "",
    lastExport: null,
    exportError: null,
    copilotBusy: false
  };

  const viewReady = new Set<string>();
  const viewPending = new Set<string>();
  const viewErrors = new Map<string, string>();

  const screenKey = (view = state.view) => `${view}:${state.patientId}`;

  const retryView = () => {
    analysisErrors.clear();
    viewErrors.delete(screenKey());
    viewReady.delete(screenKey());
  };

  let focusAfterRender: "main" | "roster" | "audit" | "messages" | "palette" | null = null;

  const patient = () => patientById(state.patientId) ?? PATIENTS[0];

  // Charts are static, so each (chart, depth) analysis is computed once. Thorough mode
  // enumerates up to 2^n finding-flip worlds, so it runs after a paint behind a loading state.
  const analyses = new Map<string, ReasonerResult>();
  const analysisPending = new Set<string>();
  const analysisErrors = new Map<string, string>();

  const analysisFor = (p: Patient, thorough: boolean): ReasonerResult | null => {
    const key = `${p.id}:${thorough ? "thorough" : "quick"}`;
    const cached = analyses.get(key);
    if (cached) return cached;
    if (analysisErrors.has(key)) throw new Error(analysisErrors.get(key));
    if (!thorough) {
      const result = rankDiagnoses(DIAGNOSES, p.findings, { thorough: false });
      analyses.set(key, result);
      return result;
    }
    if (!analysisPending.has(key)) {
      analysisPending.add(key);
      afterPaint(() => {
        try {
          analyses.set(key, rankDiagnoses(DIAGNOSES, p.findings, { thorough: true }));
        } catch (err) {
          analysisErrors.set(key, errorMessage(err));
        } finally {
          analysisPending.delete(key);
          render();
        }
      });
    }
    return null;
  };

  const knownFindings = (p: Patient) => p.findings.filter((f) => f.polarity !== "unknown").length;

  const log = (kind: string, detail: string) => {
    state.audit = appendAudit(state.audit, makeAuditEvent(kind, detail, state.role, state.patientId));
  };

  const setPatient = (id: string) => {
    if (!patientById(id)) return;
    state.patientId = id;
    state.chat = [];
    state.graphSelected = null;
    state.lastExport = null;
    state.exportError = null;
    log("context", `Focused ${id}`);
    writeHash(state.view, state.patientId);
    render();
  };

  const setView = (view: ViewId) => {
    state.view = view;
    state.navOpen = false;
    writeHash(view, state.patientId);
    focusAfterRender = "main";
    render();
  };

  const closeOverlays = () => {
    state.navOpen = false;
    state.panelOpen = false;
    state.commandOpen = false;
  };

  const ask = (question: string, goToCopilot = false) => {
    const q = question.trim();
    if (!q || state.copilotBusy) return;
    const p = patient();
    const role = state.role;
    const mode = state.mode;
    state.chat.push({ who: "user", text: q, sourceIds: [] });
    const turn: ChatTurn = { who: "ai", text: "", sourceIds: [], pending: true };
    state.chat.push(turn);
    state.copilotBusy = true;
    afterPaint(() => {
      try {
        const reply = answerQuestion(q, p, role, mode);
        Object.assign(turn, { text: reply.text, sourceIds: reply.sourceIds, abstained: reply.abstained });
        log("copilot", `${reply.intent}: ${q.slice(0, 80)}`);
      } catch (err) {
        Object.assign(turn, { text: `NOMI couldn't answer this (${errorMessage(err)}). Nothing was saved to the chart.`, retry: q });
        log("copilot-error", `${errorMessage(err)}: ${q.slice(0, 80)}`);
      } finally {
        turn.pending = false;
        state.copilotBusy = false;
        render();
      }
    });
    if (goToCopilot) {
      state.view = "copilot";
      state.panelOpen = false;
      writeHash("copilot", state.patientId);
      focusAfterRender = "main";
    }
    render();
  };

  function renderSidebar(): string {
    return `
      <aside id="primary-nav" class="sidebar${state.navOpen ? " open" : ""}" aria-label="Primary">
        <div class="drawer-head">
          <div class="logo">
            <div class="logo-mark" aria-hidden="true">N</div>
            <div>NOMI<small>Neural open medical intelligence</small></div>
          </div>
          <button class="btn-ghost drawer-close" data-cmd="nav" aria-label="Close menu">Close</button>
        </div>
        ${VIEWS.map(
          (v) => `<button class="nav-item${state.view === v.id ? " active" : ""}" data-nav="${v.id}" ${
            state.view === v.id ? 'aria-current="page"' : ""
          }>${v.label}</button>`
        ).join("")}
        <div class="patient-switch">
          <label for="patient-select">Focused chart</label>
          <select id="patient-select">
            ${PATIENTS.map(
              (p) =>
                `<option value="${p.id}" ${p.id === state.patientId ? "selected" : ""}>${p.id} · ${p.ageYears}y ${p.sex}</option>`
            ).join("")}
          </select>
        </div>
        <div class="role-box">
          <label for="role-select">Workspace role</label>
          <select id="role-select">
            <option value="clinician" ${state.role === "clinician" ? "selected" : ""}>Clinician · dense</option>
            <option value="student" ${state.role === "student" ? "selected" : ""}>Student · explanatory</option>
            <option value="researcher" ${state.role === "researcher" ? "selected" : ""}>Researcher · trials</option>
          </select>
        </div>
        <div class="sidebar-foot">
          Attending · Day service<br />
          <span class="dot-online">● Demo session</span><br />
          <button class="btn-ghost" data-cmd="palette" style="margin-top:8px;width:100%">Search ⌘K</button>
        </div>
      </aside>`;
  }

  function renderPanel(): string {
    const p = patient();
    let body: string;
    try {
      const result = analysisFor(p, state.mode === "thorough");
      if (!result) {
        body = loadingBlock("Ranking the differential…", 3);
      } else {
        const leadSources = (result.mostLikely?.sourceIds ?? []).map(sourceById).filter(Boolean);
        body = `
          <p class="panel-lead">${escapeHtml(
            result.mostLikely
              ? `Draft for ${p.id}: ${result.mostLikely.name}.`
              : "No stable draft yet. Gather more findings."
          )}</p>
          <h3 class="section-label">Sources for the lead draft</h3>
          ${
            leadSources.length
              ? leadSources
                  .map(
                    (src) =>
                      `<div class="source"><strong>${escapeHtml(src!.title)}</strong><span>${escapeHtml(src!.summary)}</span><a href="${src!.url}" target="_blank" rel="noopener noreferrer">Open source</a></div>`
                  )
                  .join("")
              : `<p class="meta">No cited source for this draft.</p>`
          }`;
      }
    } catch (err) {
      body = errorBlock("The evidence rail couldn't load.", err, "analysis");
    }
    return `
      <aside class="right-panel${state.panelOpen ? " open" : ""}" aria-label="Evidence">
        <div class="drawer-head">
          <h2 class="panel-title">Evidence rail</h2>
          <span class="badge badge-cyan">${state.mode === "thorough" ? "Thorough" : "Quick"}</span>
          <button class="btn-ghost drawer-close" data-cmd="panel" aria-label="Close evidence">Close</button>
        </div>
        ${body}
        <form class="btn-row panel-ask" data-form="rail">
          <input name="q" type="text" placeholder="Ask about this chart…" aria-label="Ask the evidence rail" ${state.copilotBusy ? "disabled" : ""} />
          <button class="btn" type="submit" ${state.copilotBusy ? "disabled" : ""}>Ask</button>
        </form>
      </aside>`;
  }

  /** Placeholder shown while a computation runs. Announced to assistive tech via aria-busy. */
  function loadingBlock(label: string, lines = 4): string {
    return `<div class="loading" role="status" aria-live="polite" aria-busy="true">
      <span class="spinner" aria-hidden="true"></span><span>${escapeHtml(label)}</span>
      ${Array.from({ length: lines }, (_, i) => `<div class="skeleton" style="width:${92 - i * 14}%"></div>`).join("")}
    </div>`;
  }

  function errorBlock(title: string, err: unknown, retry: "analysis" | "view"): string {
    return `<div class="error-state" role="alert">
      <strong>${escapeHtml(title)}</strong>
      <p>${escapeHtml(errorMessage(err))}. The chart data is unchanged.</p>
      <div class="btn-row"><button class="btn" data-retry="${retry}">Try again</button></div>
    </div>`;
  }

  function emptyBlock(title: string, body: string, action = ""): string {
    return `<div class="empty-state" role="status">
      <strong>${escapeHtml(title)}</strong>
      <p>${body}</p>
      ${action}
    </div>`;
  }

  function renderDashboard(): string {
    const p = patient();
    const result = analysisFor(p, true);
    const egfr = lab(p, "egfr");
    const potassium = lab(p, "k");
    const interactions = analyzeInteractions(p.meds, { egfr, potassium });
    const news = news2Like({
      rr: p.vitals.rr,
      spo2: p.vitals.spo2,
      sbp: p.vitals.bpSys,
      hr: p.vitals.hr,
      tempC: p.vitals.tempC
    });
    const fhirCounts = bundleResourceCounts(buildFhirBundle(p));
    const fhirTotal = Object.values(fhirCounts).reduce((a, b) => a + b, 0);

    return `
      <div class="grid-2">
        <div>
          <section class="card card-lead" aria-labelledby="assess-title">
            ${result ? renderAssessment(p, result, news) : `
              <h2 class="card-title" id="assess-title">Working assessment</h2>
              ${loadingBlock(`Ranking the differential across ${(1 << Math.min(14, knownFindings(p))).toLocaleString()} finding-flip worlds…`)}`}
          </section>
          <section class="card" aria-labelledby="ddx-title">
            <h2 class="card-title" id="ddx-title">Differential <span class="badge badge-cyan">Cited</span></h2>
            ${result ? renderDifferential(result) : loadingBlock("Waiting for the ranking…", 3)}
          </section>
        </div>
        <div>
          <section class="card" aria-labelledby="labs-title">
            <h2 class="card-title" id="labs-title">Key labs <span class="card-sub">Drawn ${ago(p.labsDrawnMinutesAgo)}</span></h2>
            ${p.labs
              .map(
                (l) =>
                  `<div class="row lab-row">
                    <div><span>${escapeHtml(l.name)}</span><div class="meta">Ref ${l.refLow}–${l.refHigh} ${escapeHtml(l.unit)}</div></div>
                    <div class="lab-value"><strong>${l.value} <span class="unit">${escapeHtml(l.unit)}</span></strong>${
                      l.flag === "normal" ? "" : `<span class="badge ${l.flag === "high" ? "badge-low" : "badge-warn"}">${l.flag === "high" ? "↑ High" : "↓ Low"}</span>`
                    }</div>
                  </div>`
              )
              .join("")}
          </section>
          <section class="card" aria-labelledby="meds-title">
            <h2 class="card-title" id="meds-title">Medication safety</h2>
            ${
              interactions.length
                ? interactions
                    .map(
                      (a) =>
                        `<div class="alert ${a.severity === "moderate" ? "moderate" : ""}"><strong>${escapeHtml(a.drugs.join(" + "))} · ${a.severity}</strong><p>${escapeHtml(a.mechanism)}</p><p><em>${escapeHtml(a.management)}</em></p>${
                          a.modifiers.length ? `<div class="meta">${escapeHtml(a.modifiers.join(" · "))}</div>` : ""
                        }</div>`
                    )
                    .join("")
                : `<p class="meta">No coded pair fired. The formulary is incomplete, so this is not a safety clearance.</p>`
            }
            <div class="meta" style="margin-top:10px">Regimen: ${p.meds.map((m) => escapeHtml(`${m.name} ${m.dose}`)).join(" · ")}</div>
          </section>
          <section class="card" aria-labelledby="cohort-title">
            <h2 class="card-title" id="cohort-title">Similar cohort <span class="card-sub">Synthetic</span></h2>
            <p>${escapeHtml(p.similar.label)}</p>
            <p class="meta">n=${p.similar.n} · ${escapeHtml(p.similar.outcome)} · ${escapeHtml(p.similar.interval)}</p>
            <p class="meta">${escapeHtml(p.similar.freshness)}</p>
          </section>
          <section class="card" aria-labelledby="fhir-title">
            <h2 class="card-title" id="fhir-title">FHIR export <span class="badge badge-cyan">Read-only</span></h2>
            <p class="meta">FHIR R4 collection of ${fhirTotal} resources for this chart. Identifiers only: no personal names, and nothing is written back to an EHR.</p>
            <div class="chips" style="margin:10px 0">
              ${Object.entries(fhirCounts)
                .map(([kind, n]) => `<span class="chip">${escapeHtml(kind)} × ${n}</span>`)
                .join("")}
            </div>
            <ul class="chips fhir-provenance" aria-label="Exported resources" style="list-style:none;padding:0;margin:0 0 10px">
              ${fhirChips(p)
                .map(
                  (c) =>
                    `<li class="chip" data-fhir-ref="${escapeHtml(`${c.resourceType}/${c.id}`)}" title="${escapeHtml(`${c.resourceType}/${c.id}`)}">${escapeHtml(c.label)}</li>`
                )
                .join("")}
            </ul>
            <div class="btn-row">
              <button class="btn" type="button" data-fhir-export>Download FHIR bundle</button>
              ${
                state.lastExport && !state.exportError
                  ? `<span class="badge badge-high" role="status">Saved ${escapeHtml(state.lastExport)}</span>`
                  : ""
              }
            </div>
            ${
              state.exportError
                ? `<div class="error-state" role="alert"><strong>Export failed.</strong><p>${escapeHtml(state.exportError)}. Nothing was downloaded. Try again.</p></div>`
                : ""
            }
          </section>
          ${
            state.role === "student"
              ? `<section class="card"><h2 class="card-title">Teaching pearl</h2><p>${escapeHtml(p.teachingPearl)}</p></section>`
              : ""
          }
          ${
            state.role === "researcher"
              ? `<section class="card"><h2 class="card-title">Trial and literature notes</h2><ul class="list">${p.trialHints.map((t) => `<li>${escapeHtml(t)}</li>`).join("")}</ul></section>`
              : ""
          }
        </div>
      </div>`;
  }

  function renderAssessment(p: Patient, result: ReasonerResult, news: { name: string; value: number }): string {
    const insightKey = `${p.id}-insight`;
    const status = state.insight[insightKey] ?? "pending";
    const lead = result.mostLikely;
    const confidenceClass =
      result.confidence === "high" ? "high" : result.confidence === "low" || result.confidence === "abstain" ? "low" : "med";
    const drivers = lead?.drivers.slice(0, 3).map((d) => d.label) ?? [];
    const cannotMiss = result.cannotMiss.filter((d) => d.id !== lead?.id);
    return `
      <div class="eyebrow">Working assessment · draft</div>
      <div class="lead-head">
        <h2 class="lead-dx" id="assess-title">${escapeHtml(lead?.name ?? "No stable draft")}</h2>
        <span class="badge badge-${confidenceClass}">${CONFIDENCE_LABEL[result.confidence]}</span>
      </div>
      <p class="lead-why">${
        drivers.length ? `Driven by ${escapeHtml(drivers.join(", "))}.` : escapeHtml(result.confidenceWhy)
      }</p>
      ${
        cannotMiss.length
          ? `<div class="alert moderate cannot-miss"><strong>Don't close the chart without considering</strong> ${escapeHtml(cannotMiss.map((d) => d.name).join(", "))}.</div>`
          : ""
      }
      <details class="explain"${state.role === "student" ? " open" : ""}>
        <summary>Why NOMI ranked it this way</summary>
        <p>${escapeHtml(explainForRole(result, state.role))}</p>
      </details>
      <div class="chips">${
        p.problems.length
          ? p.problems.map((x) => `<span class="chip">${escapeHtml(x)}</span>`).join("")
          : `<span class="meta">No active problems recorded</span>`
      }</div>
      <div class="vitals" aria-label="Vitals, charted ${ago(p.vitals.takenMinutesAgo)}">
        <div class="vital"><div class="val">${p.vitals.bpSys}/${p.vitals.bpDia}</div><div class="lbl">Blood pressure</div></div>
        <div class="vital"><div class="val">${p.vitals.hr}</div><div class="lbl">Heart rate</div></div>
        <div class="vital"><div class="val">${p.vitals.spo2}%</div><div class="lbl">SpO₂</div></div>
        <div class="vital"><div class="val">${news.value}</div><div class="lbl">${escapeHtml(news.name.split(" ")[0])}</div></div>
      </div>
      <p class="meta">Vitals charted ${ago(p.vitals.takenMinutesAgo)}.</p>
      <div class="btn-row">
        <button class="btn" data-act="accepted" data-id="${insightKey}">Accept draft</button>
        <button class="btn-ghost" data-act="deferred" data-id="${insightKey}">Defer</button>
        <button class="btn-danger" data-act="overridden" data-id="${insightKey}">Override</button>
        <span class="badge badge-cyan" role="status">Status: ${actionLabel(status)}</span>
      </div>
      <p class="meta">${result.worldsEvaluated.toLocaleString()} worlds evaluated. Draft only, not an order.</p>`;
  }

  function renderDifferential(result: ReasonerResult): string {
    const lead = result.ranked[0];
    const most = result.ranked.filter((d, i) => i === 0 || d.band === "strong");
    const miss = result.cannotMiss.filter((d) => d.id !== lead?.id);
    const missIds = new Set(miss.map((d) => d.id));
    const expanded = result.ranked.filter(
      (d) => d.band === "possible" && d.id !== lead?.id && !missIds.has(d.id)
    );
    return `
      <h3 class="section-label">Most likely</h3>
      ${most.map((d) => dxRow(d)).join("")}
      ${expanded.length ? `<h3 class="section-label">Expanded</h3>${expanded.map((d) => dxRow(d)).join("")}` : ""}
      ${miss.length ? `<h3 class="section-label">Cannot miss</h3>${miss.map((d) => dxRow(d)).join("")}` : ""}`;
  }

  function dxRow(d: { name: string; posterior: number; band: string; drivers: { label: string }[] }): string {
    return `<div class="row">
      <div><strong>${escapeHtml(d.name)}</strong><div class="meta">${escapeHtml(d.drivers.slice(0, 2).map((x) => x.label).join(" · ") || "—")}</div></div>
      <div style="display:flex;align-items:center;gap:8px">
        <div class="strength"><span style="width:${Math.round(d.posterior * 100)}%"></span></div>
        <span class="badge badge-${d.band === "strong" ? "high" : d.band === "low" ? "low" : "med"}">${escapeHtml(d.band)}</span>
      </div>
    </div>`;
  }

  function renderCopilot(): string {
    const p = patient();
    const turns =
      state.chat.length === 0
        ? emptyBlock(
            "Ask a chart-grounded question.",
            `Try “most likely diagnosis”, “drug interactions”, or “sources”. Thorough mode checks ${(1 << Math.min(14, knownFindings(p))).toLocaleString()} finding-flip worlds before answering.`
          )
        : state.chat
            .map((t) => {
              if (t.pending) {
                return `<div class="msg ai pending" role="status" aria-busy="true"><span class="spinner" aria-hidden="true"></span>Checking the chart and the evidence catalog…</div>`;
              }
              if (t.retry) {
                return `<div class="msg ai error" role="alert">${escapeHtml(t.text)}<div class="btn-row"><button class="btn-ghost" data-retry-ask="${escapeHtml(t.retry)}">Try again</button></div></div>`;
              }
              const sources = t.sourceIds
                .map(sourceById)
                .filter(Boolean)
                .map((src) => `<div class="source"><strong>${escapeHtml(src!.title)}</strong><a href="${src!.url}" target="_blank" rel="noopener noreferrer">${escapeHtml(src!.url)}</a></div>`)
                .join("");
              return `<div class="msg ${t.who}${t.abstained ? " ab" : ""}">${escapeHtml(t.text)}</div>${sources}`;
            })
            .join("");
    return `<section class="card" aria-labelledby="copilot-title">
      <h2 class="card-title" id="copilot-title">NOMI copilot
        <span class="mode-toggle" role="group" aria-label="Copilot depth">
          <button class="btn-ghost${state.mode === "quick" ? " active" : ""}" data-mode="quick" aria-pressed="${state.mode === "quick"}">Quick</button>
          <button class="btn-ghost${state.mode === "thorough" ? " active" : ""}" data-mode="thorough" aria-pressed="${state.mode === "thorough"}">Thorough</button>
        </span>
      </h2>
      <div id="thread" aria-live="polite">${turns}</div>
      <form class="btn-row" data-form="copilot" style="margin-top:12px">
        <input name="q" type="text" placeholder="Ask about this patient or the local catalog…" aria-label="Copilot question" ${state.copilotBusy ? "disabled" : ""} />
        <button class="btn" type="submit" ${state.copilotBusy ? 'disabled aria-busy="true"' : ""}>${state.copilotBusy ? "Working…" : "Send"}</button>
      </form>
    </section>`;
  }

  function renderGraph(): string {
    const p = patient();
    const { nodes, edges } = buildGraph(p);
    const laid: LaidOutNode[] = layoutGraph(nodes, edges, 720, 400, 220);
    const selected = state.graphSelected;
    const neighbor = selected ? new Set(neighborsOf(selected, edges)) : null;
    const labelOf = (id: string) => laid.find((n) => n.id === id)?.label ?? id;
    const lines = edges
      .map((e) => {
        const a = laid.find((n) => n.id === e.from);
        const b = laid.find((n) => n.id === e.to);
        if (!a || !b) return "";
        const dim = selected && a.id !== selected && b.id !== selected ? 'opacity="0.18"' : "";
        return `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="#334155" stroke-width="1" ${dim} />`;
      })
      .join("");
    const circles = laid
      .map((n) => {
        const color =
          n.kind === "diagnosis" ? "#22d3ee" : n.kind === "finding" ? "#34d399" : n.kind === "drug" ? "#fbbf24" : n.kind === "trial" ? "#c084fc" : "#94a3b8";
        const showLabel = !selected || n.id === selected || Boolean(neighbor?.has(n.id));
        const dim = selected && n.id !== selected && !neighbor?.has(n.id) ? 0.25 : 1;
        return `<g data-node="${escapeHtml(n.id)}" role="button" tabindex="0" aria-label="${escapeHtml(n.label)} (${n.kind})" opacity="${dim}" style="cursor:pointer">
          <circle cx="${n.x}" cy="${n.y}" r="8" fill="${color}"></circle>
          ${showLabel ? `<text class="node-label" x="${n.x + 10}" y="${n.y + 4}">${escapeHtml(n.label)}</text>` : ""}
        </g>`;
      })
      .join("");
    const detail = selected
      ? `<p class="meta">Selected <strong>${escapeHtml(labelOf(selected))}</strong> · neighbors: ${escapeHtml(
          neighborsOf(selected, edges).map(labelOf).join(", ") || "none"
        )}</p>`
      : emptyBlock(
          "No node selected.",
          "Click a node to reveal neighbor labels. Layout used 220 cooling ticks (quality over speed)."
        );
    if (!laid.length) {
      return `<section class="card" aria-labelledby="graph-title"><h2 class="card-title" id="graph-title">Patient data ↔ diagnoses ↔ sources</h2>
        ${emptyBlock("No graph for this chart.", "Findings and draft diagnoses appear here when the chart has them.")}
      </section>`;
    }
    return `<section class="card" aria-labelledby="graph-title"><h2 class="card-title" id="graph-title">Patient data ↔ diagnoses ↔ sources</h2>
      <div class="graph-wrap"><svg viewBox="0 0 720 400" role="group" aria-label="Knowledge graph">${lines}${circles}</svg></div>
      ${detail}
    </section>`;
  }

  function renderPatients(): string {
    const units = ["", ...new Set(PATIENTS.map((p) => p.unit))];
    const rows = filterPatients(PATIENTS, state.rosterQuery, state.rosterUnit);
    if (rows.length === 0) {
      return `<section class="card" aria-labelledby="roster-title">
      <h2 class="card-title" id="roster-title">Demo roster <span class="badge badge-cyan">0</span></h2>
      ${rosterFilters(units)}
      ${emptyBlock(
        "No charts match.",
        `Nothing matches “${escapeHtml(state.rosterQuery)}”${state.rosterUnit ? ` in ${escapeHtml(state.rosterUnit)}` : ""}.`,
        `<div class="btn-row"><button class="btn-ghost" data-clear="roster">Clear filters</button></div>`
      )}
    </section>`;
    }
    return `<section class="card" aria-labelledby="roster-title">
      <h2 class="card-title" id="roster-title">Demo roster <span class="badge badge-cyan">${rows.length}</span></h2>
      ${rosterFilters(units)}
      <div class="table-wrap"><table class="table">
        <thead><tr><th>Chart</th><th>Concern</th><th>Unit</th><th>Lead draft</th><th></th></tr></thead>
        <tbody>
          ${rows
            .map((p) => {
              const lead = analysisFor(p, false)?.mostLikely;
              return `<tr>
                <td>${p.id}<div class="meta">${p.ageYears}y · ${p.sex}</div></td>
                <td>${escapeHtml(p.chiefConcern)}</td>
                <td>${escapeHtml(p.unit)}</td>
                <td>${escapeHtml(lead?.name ?? "Abstain")}</td>
                <td><button class="btn-ghost" data-open-patient="${p.id}">Open</button></td>
              </tr>`;
            })
            .join("")}
        </tbody>
      </table></div>
    </section>`;
  }

  function rosterFilters(units: string[]): string {
    return `<div class="btn-row filters">
        <input id="roster-q" type="search" value="${escapeHtml(state.rosterQuery)}" placeholder="Filter by id, problem, concern…" aria-label="Filter roster" />
        <select id="roster-unit" aria-label="Filter by unit">${units.map((u) => `<option value="${escapeHtml(u)}" ${u === state.rosterUnit ? "selected" : ""}>${u || "All units"}</option>`).join("")}</select>
      </div>`;
  }

  function trace(label: string, values: number[], unit: string, invert = false): string {
    if (!values.length) return `<div class="trace"><div class="trace-head"><strong>${label}</strong></div><p class="meta">No readings in the last 24 hours.</p></div>`;
    const latest = values[values.length - 1];
    return `<div class="trace">
      <div class="trace-head"><strong>${label}</strong><span>${latest}${unit} now</span></div>
      ${sparkline(values, invert)}
      <div class="meta">24 h range ${Math.min(...values)}–${Math.max(...values)}${unit}</div>
    </div>`;
  }

  function renderMonitoring(): string {
    const p = patient();
    const anomalies = detectAnomalies(p.series);
    const news = news2Like({
      rr: p.vitals.rr,
      spo2: p.vitals.spo2,
      sbp: p.vitals.bpSys,
      hr: p.vitals.hr,
      tempC: p.vitals.tempC
    });
    const hf = decompRisk({
      bnp: lab(p, "bnp") ?? 0,
      spo2: p.vitals.spo2,
      hr: p.vitals.hr,
      egfr: lab(p, "egfr") ?? 90
    });
    return `
      <div class="grid-3">
        <section class="card stat"><h2 class="card-title">${escapeHtml(news.name)}</h2><div class="stat-value">${news.value}<span class="meta"> / ${news.max}</span></div><span class="badge badge-${bandBadge(news.band)}">${news.band}</span></section>
        <section class="card stat"><h2 class="card-title">${escapeHtml(hf.name)}</h2><div class="stat-value">${hf.value}<span class="meta"> / ${hf.max}</span></div><span class="badge badge-${bandBadge(hf.band)}">${hf.band}</span></section>
        <section class="card stat"><h2 class="card-title">Anomalies (MAD)</h2><div class="stat-value">${anomalies.length}</div><div class="meta">Robust z ≥ 3.2</div></section>
      </div>
      <section class="card">
        <h2 class="card-title">24-hour traces</h2>
        <div class="grid-2 traces">
          ${trace("Heart rate", p.series.map((s) => s.hr), " /min")}
          ${trace("SpO₂", p.series.map((s) => s.spo2), "%", true)}
          ${trace("Respiratory rate", p.series.map((s) => s.rr), " /min")}
          ${trace("Systolic BP", p.series.map((s) => s.sbp), " mmHg", true)}
        </div>
      </section>
      <section class="card">
        <h2 class="card-title">Closed-loop alerts</h2>
        ${
          anomalies.length === 0
            ? emptyBlock("No alerts.", "No robust outliers on this synthetic trace.")
            : anomalies
                .slice(0, 6)
                .map((a, i) => {
                  const id = `${p.id}-${a.metric}-${a.index}-${i}`;
                  const st = state.alerts[id] ?? "open";
                  return `<div class="row">
                    <div>${escapeHtml(a.message)}<div class="meta">${a.severity} · hour ${a.index}</div></div>
                    <div class="btn-row">
                      <span class="badge badge-${st === "acknowledged" ? "high" : st === "escalated" ? "low" : "med"}">${st}</span>
                      <button class="btn-ghost" data-alert="acknowledged" data-id="${id}">Acknowledge</button>
                      <button class="btn-danger" data-alert="escalated" data-id="${id}">Escalate</button>
                    </div>
                  </div>`;
                })
                .join("")
        }
      </section>`;
  }

  function renderMessages(): string {
    const p = patient();
    const q = state.messageQuery.trim().toLowerCase();
    const threads = q
      ? p.threads.filter((t) => `${t.subject} ${t.body ?? ""} ${t.draft ?? ""}`.toLowerCase().includes(q))
      : p.threads;
    const filter = `<div class="btn-row filters">
        <input id="message-q" type="search" value="${escapeHtml(state.messageQuery)}" placeholder="Filter threads…" aria-label="Filter messages" />
      </div>`;
    if (threads.length === 0) {
      return `<section class="card" aria-labelledby="messages-title"><h2 class="card-title" id="messages-title">Threads</h2>
      ${filter}
      ${emptyBlock(
        p.threads.length === 0 ? `No messages for ${p.id}.` : `No threads match “${escapeHtml(state.messageQuery)}”.`,
        "Care-team threads and patient drafts appear here.",
        p.threads.length
          ? `<div class="btn-row"><button class="btn-ghost" data-clear="messages">Clear filter</button></div>`
          : ""
      )}
    </section>`;
    }
    return `<section class="card" aria-labelledby="messages-title"><h2 class="card-title" id="messages-title">Threads</h2>
      ${filter}
      ${threads
        .map((t) => {
          const released = state.released.includes(t.id);
          return `<div class="thread">
            <h3 class="thread-subject">${escapeHtml(t.subject)}</h3>
            <div class="meta">${t.audience} ${t.needsReview ? "· requires review" : ""} ${t.unread ? "· unread" : ""}</div>
            <p style="margin:8px 0">${escapeHtml(t.body ?? t.draft ?? "")}</p>
            ${
              t.needsReview
                ? released
                  ? `<span class="badge badge-high">Released after review</span>`
                  : `<div class="btn-row"><button class="btn" data-release="${t.id}">Review &amp; release</button><span class="meta">NOMI will not send this automatically.</span></div>`
                : ""
            }
          </div>`;
        })
        .join("")}
    </section>`;
  }

  function renderAudit(): string {
    const rows = filterAudit(state.audit, state.auditQuery);
    return `<section class="card">
      <h2 class="card-title">Immutable session log <span class="badge badge-cyan">${rows.length}</span></h2>
      <input id="audit-q" type="search" value="${escapeHtml(state.auditQuery)}" placeholder="Filter events…" aria-label="Filter audit" />
      ${
        rows.length === 0
          ? emptyBlock(
              `No events match “${escapeHtml(state.auditQuery)}”.`,
              "The session log is still on this device. Clear the filter to see every event.",
              `<div class="btn-row"><button class="btn-ghost" data-clear="audit">Clear filter</button></div>`
            )
          : `<div class="table-wrap"><table class="table">
        <thead><tr><th>When</th><th>Kind</th><th>Detail</th><th>Role</th><th>Chart</th></tr></thead>
        <tbody>
          ${rows
            .slice()
            .reverse()
            .map(
              (e) =>
                `<tr><td>${escapeHtml(e.at)}</td><td>${escapeHtml(e.kind)}</td><td>${escapeHtml(e.detail)}</td><td>${e.role}</td><td>${e.patientId ?? "—"}</td></tr>`
            )
            .join("")}
        </tbody>
      </table></div>`
      }
    </section>`;
  }

  function renderPalette(): string {
    if (!state.commandOpen) return "";
    const hits = searchAll(state.commandQuery || "dashboard");
    return `<div class="palette" data-close-palette>
      <div class="palette-box" role="dialog" aria-label="Command palette">
        <input id="palette-q" type="search" value="${escapeHtml(state.commandQuery)}" placeholder="Search charts, sources, views…" aria-label="Command search" />
        ${hits
          .map(
            (h) =>
              `<button class="hit" data-hit-kind="${h.kind}" data-hit-id="${escapeHtml(h.id)}"><strong>${escapeHtml(h.title)}</strong><small>${escapeHtml(h.blurb)}</small></button>`
          )
          .join("")}
      </div>
    </div>`;
  }

  function render(): void {
    writeHash(state.view, state.patientId);
    const p = patient();
    const views: Record<ViewId, () => string> = {
      dashboard: renderDashboard,
      copilot: renderCopilot,
      graph: renderGraph,
      patients: renderPatients,
      monitoring: renderMonitoring,
      messages: renderMessages,
      audit: renderAudit
    };
    let body: string;
    const key = screenKey();
    if (isGated(state.view) && viewErrors.has(key)) {
      body = `<section class="card">${errorBlock(`${TITLES[state.view]} couldn't load.`, viewErrors.get(key), "view")}</section>`;
    } else if (isGated(state.view) && !viewReady.has(key)) {
      if (!viewPending.has(key)) {
        viewPending.add(key);
        afterPaint(() => {
          try {
            viewReady.add(key);
          } catch (err) {
            viewErrors.set(key, errorMessage(err));
          } finally {
            viewPending.delete(key);
            render();
          }
        });
      }
      body = `<section class="card">${loadingBlock(VIEW_LOADING[state.view])}</section>`;
    } else {
      try {
        body = views[state.view]();
      } catch (err) {
        console.error(err);
        if (isGated(state.view)) {
          viewErrors.set(key, errorMessage(err));
        }
        body = `<section class="card">${errorBlock(`${TITLES[state.view]} couldn't load.`, err, isGated(state.view) ? "view" : "analysis")}</section>`;
      }
    }
    const moreActive = !MOBILE_PRIMARY.includes(state.view);

    const overlayOpen = state.navOpen || state.panelOpen;
    root.innerHTML = `
      <div class="disclaimer-bar"><span class="disc-full">NOMI is a demonstration prototype. <strong>Not medical advice</strong>, not a diagnosis, not a medical device, and not a substitute for a licensed clinician. Human review is required before any documentation, order, prescription, or patient message.</span><span class="disc-short">Demo prototype. <strong>Not medical advice</strong> or a medical device. Human review required.</span></div>
      <div class="app">
        ${renderSidebar()}
        <main class="main" id="main" data-screen="${state.view}">
          <div class="mobile-bar">
            <button class="btn-ghost" data-cmd="nav" aria-expanded="${state.navOpen}" aria-controls="primary-nav">Menu</button>
            <div class="patient-chip">${p.id} · ${p.ageYears}y</div>
            <button class="btn-ghost" data-cmd="panel" aria-expanded="${state.panelOpen}">Evidence</button>
          </div>
          <div class="header">
            <div>
              <h1 tabindex="-1">${TITLES[state.view]}</h1>
              <div class="header-meta"><strong>${p.id}</strong> · ${p.ageYears}y ${p.sex} · MRN ${p.mrn} · ${escapeHtml(p.unit)} · admitted ${p.admitHoursAgo}h ago</div>
              <div class="meta">${escapeHtml(p.chiefConcern)}</div>
            </div>
            <div class="live-pill">NOMI-3 demo · ${state.role}</div>
          </div>
          ${body}
          <p class="footer-note">© Demo workspace · <a href="https://www.hl7.org/fhir/" target="_blank" rel="noopener noreferrer">FHIR</a> · <a href="https://www.fda.gov/regulatory-information/search-fda-guidance-documents/clinical-decision-support-software" target="_blank" rel="noopener noreferrer">FDA CDS guidance</a> · See README for the full disclaimer. No personal names in this roster.</p>
        </main>
        ${renderPanel()}
      </div>
      <div class="scrim${overlayOpen ? " show" : ""}" data-cmd="close-overlays" ${overlayOpen ? "" : "hidden"}></div>
      <nav class="bottom-nav" aria-label="Primary mobile">
        ${VIEWS.filter((v) => MOBILE_PRIMARY.includes(v.id))
          .map(
            (v) =>
              `<button class="bottom-nav-item${state.view === v.id ? " active" : ""}" data-nav="${v.id}" ${
                state.view === v.id ? 'aria-current="page"' : ""
              }><span class="nav-full">${v.id === "copilot" ? "Copilot" : v.label}</span><span class="nav-short">${v.short}</span></button>`
          )
          .join("")}
        <button class="bottom-nav-item${moreActive ? " active" : ""}" data-cmd="nav" aria-expanded="${state.navOpen}" aria-controls="primary-nav"><span class="nav-full">${moreActive ? escapeHtml(VIEWS.find((v) => v.id === state.view)!.label) : "More"}</span><span class="nav-short">${moreActive ? escapeHtml(VIEWS.find((v) => v.id === state.view)!.short) : "More"}</span></button>
      </nav>
      ${renderPalette()}`;

    bind();
  }

  function bind(): void {
    root.querySelectorAll<HTMLButtonElement>("[data-nav]").forEach((btn) => {
      btn.addEventListener("click", () => setView(btn.dataset.nav as ViewId));
    });
    root.querySelector("#patient-select")?.addEventListener("change", (e) => {
      setPatient((e.target as HTMLSelectElement).value);
    });
    root.querySelector("#role-select")?.addEventListener("change", (e) => {
      state.role = (e.target as HTMLSelectElement).value as Role;
      log("role", `Role set to ${state.role}`);
      render();
    });
    root.querySelectorAll<HTMLButtonElement>("[data-act]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.dataset.id!;
        const act = btn.dataset.act as InsightAction;
        state.insight[id] = act;
        log(act, `${act} insight ${id}`);
        render();
      });
    });
    root.querySelectorAll<HTMLFormElement>("[data-form]").forEach((form) => {
      form.addEventListener("submit", (e) => {
        e.preventDefault();
        const input = form.querySelector("input");
        if (input) ask(input.value, form.dataset.form === "rail");
      });
    });
    root.querySelector<HTMLButtonElement>("[data-fhir-export]")?.addEventListener("click", () => {
      const current = patient();
      try {
        downloadFhir(current);
        state.lastExport = fhirFilename(current.id);
        state.exportError = null;
        log("export", `Downloaded FHIR bundle ${state.lastExport}`);
      } catch (err) {
        state.exportError = errorMessage(err);
        log("export-error", `FHIR bundle for ${current.id}: ${state.exportError}`);
      }
      render();
    });
    root.querySelectorAll<HTMLButtonElement>("[data-retry]").forEach((btn) => {
      btn.addEventListener("click", () => {
        retryView();
        render();
      });
    });
    root.querySelectorAll<HTMLButtonElement>("[data-retry-ask]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const question = btn.dataset.retryAsk!;
        const failed = state.chat.findIndex((t) => t.retry === question);
        if (failed > 0) state.chat.splice(failed - 1, 2);
        ask(question);
      });
    });
    root.querySelectorAll<HTMLButtonElement>("[data-clear]").forEach((btn) => {
      btn.addEventListener("click", () => {
        if (btn.dataset.clear === "roster") {
          state.rosterQuery = "";
          state.rosterUnit = "";
          focusAfterRender = "roster";
        } else if (btn.dataset.clear === "messages") {
          state.messageQuery = "";
          focusAfterRender = "messages";
        } else {
          state.auditQuery = "";
          focusAfterRender = "audit";
        }
        render();
      });
    });
    root.querySelectorAll<HTMLButtonElement>("[data-mode]").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.mode = btn.dataset.mode as CopilotMode;
        log("mode", `Copilot mode ${state.mode}`);
        render();
      });
    });
    root.querySelectorAll<SVGGElement>("[data-node]").forEach((g) => {
      const select = () => {
        state.graphSelected = g.getAttribute("data-node");
        render();
      };
      g.addEventListener("click", select);
      g.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          select();
        }
      });
    });
    root.querySelector("#roster-q")?.addEventListener("input", (e) => {
      state.rosterQuery = (e.target as HTMLInputElement).value;
      focusAfterRender = "roster";
      render();
    });
    root.querySelector("#roster-unit")?.addEventListener("change", (e) => {
      state.rosterUnit = (e.target as HTMLSelectElement).value;
      render();
    });
    root.querySelectorAll<HTMLButtonElement>("[data-open-patient]").forEach((btn) => {
      btn.addEventListener("click", () => {
        setPatient(btn.dataset.openPatient!);
        setView("dashboard");
      });
    });
    root.querySelectorAll<HTMLButtonElement>("[data-alert]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.dataset.id!;
        state.alerts[id] = btn.dataset.alert as AlertAction;
        log("alert", `${state.alerts[id]} ${id}`);
        render();
      });
    });
    root.querySelectorAll<HTMLButtonElement>("[data-release]").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.released.push(btn.dataset.release!);
        log("release", `Reviewed and released ${btn.dataset.release}`);
        render();
      });
    });
    root.querySelector("#audit-q")?.addEventListener("input", (e) => {
      state.auditQuery = (e.target as HTMLInputElement).value;
      focusAfterRender = "audit";
      render();
    });
    root.querySelector("#message-q")?.addEventListener("input", (e) => {
      state.messageQuery = (e.target as HTMLInputElement).value;
      focusAfterRender = "messages";
      render();
    });
    root.querySelectorAll<HTMLButtonElement>("[data-cmd]").forEach((btn) => {
      btn.addEventListener("click", () => {
        if (btn.dataset.cmd === "palette") {
          state.commandOpen = true;
          focusAfterRender = "palette";
        }
        if (btn.dataset.cmd === "nav") {
          state.navOpen = !state.navOpen;
          if (state.navOpen) state.panelOpen = false;
        }
        if (btn.dataset.cmd === "panel") {
          state.panelOpen = !state.panelOpen;
          if (state.panelOpen) state.navOpen = false;
        }
        if (btn.dataset.cmd === "close-overlays") closeOverlays();
        render();
      });
    });
    root.querySelector("[data-close-palette]")?.addEventListener("click", (e) => {
      if ((e.target as HTMLElement).hasAttribute("data-close-palette")) {
        state.commandOpen = false;
        render();
      }
    });
    root.querySelector("#palette-q")?.addEventListener("input", (e) => {
      state.commandQuery = (e.target as HTMLInputElement).value;
      focusAfterRender = "palette";
      render();
    });
    if (focusAfterRender === "main") {
      const heading = root.querySelector("h1");
      if (heading instanceof HTMLElement) heading.focus();
    } else if (focusAfterRender === "roster") {
      const el = document.getElementById("roster-q") as HTMLInputElement | null;
      if (el) {
        el.focus();
        el.setSelectionRange(state.rosterQuery.length, state.rosterQuery.length);
      }
    } else if (focusAfterRender === "audit") {
      const el = document.getElementById("audit-q") as HTMLInputElement | null;
      if (el) {
        el.focus();
        el.setSelectionRange(state.auditQuery.length, state.auditQuery.length);
      }
    } else if (focusAfterRender === "messages") {
      const el = document.getElementById("message-q") as HTMLInputElement | null;
      if (el) {
        el.focus();
        el.setSelectionRange(state.messageQuery.length, state.messageQuery.length);
      }
    } else if (focusAfterRender === "palette") {
      const el = document.getElementById("palette-q") as HTMLInputElement | null;
      if (el) {
        el.focus();
        el.setSelectionRange(state.commandQuery.length, state.commandQuery.length);
      }
    }
    focusAfterRender = null;

    root.querySelectorAll<HTMLButtonElement>("[data-hit-kind]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const kind = btn.dataset.hitKind;
        const id = btn.dataset.hitId!;
        state.commandOpen = false;
        if (kind === "patient") {
          setPatient(id);
          setView("dashboard");
        } else if (kind === "command") {
          setView(id as ViewId);
        } else if (kind === "source") {
          const src = sourceById(id);
          if (src) window.open(src.url, "_blank", "noopener,noreferrer");
          render();
        }
      });
    });
  }

  window.addEventListener("hashchange", () => {
    const next = parseHash();
    state.view = next.view;
    if (next.patientId !== state.patientId) {
      state.patientId = next.patientId;
      state.chat = [];
      state.graphSelected = null;
      state.lastExport = null;
      state.exportError = null;
    }
    focusAfterRender = "main";
    render();
  });

  window.addEventListener("keydown", (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
      e.preventDefault();
      state.commandOpen = true;
      focusAfterRender = "palette";
      render();
    }
    if (e.key === "Escape" && (state.commandOpen || state.navOpen || state.panelOpen)) {
      closeOverlays();
      render();
    }
  });

  render();
}
