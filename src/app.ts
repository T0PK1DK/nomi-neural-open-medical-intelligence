import { DIAGNOSES, sourceById } from "./data/catalog";
import { PATIENTS, patientById } from "./data/patients";
import { appendAudit, filterAudit, makeAuditEvent } from "./engine/audit";
import { answerQuestion } from "./engine/copilot";
import { layoutGraph, neighborsOf, type LaidOutNode } from "./engine/graph";
import { analyzeInteractions } from "./engine/interactions";
import { explainForRole, rankDiagnoses } from "./engine/reasoner";
import { decompRisk, detectAnomalies, news2Like } from "./engine/risk";
import { filterPatients, searchAll } from "./engine/search";
import type {
  AlertAction,
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
}

const VIEWS: { id: ViewId; label: string }[] = [
  { id: "dashboard", label: "Dashboard" },
  { id: "copilot", label: "AI Copilot" },
  { id: "graph", label: "Knowledge graph" },
  { id: "patients", label: "Patients" },
  { id: "monitoring", label: "Monitoring" },
  { id: "messages", label: "Messages" },
  { id: "audit", label: "Audit" }
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
  const pts = values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * 120;
      const y = invert ? ((v - min) / span) * 40 + 4 : 44 - ((v - min) / span) * 40;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  return `<svg class="spark" viewBox="0 0 120 48" aria-hidden="true"><polyline fill="none" stroke="#22d3ee" stroke-width="2" points="${pts}" /></svg>`;
}

function actionLabel(action: InsightAction | AlertAction): string {
  return action;
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
    auditQuery: ""
  };

  const patient = () => patientById(state.patientId) ?? PATIENTS[0];

  const log = (kind: string, detail: string) => {
    state.audit = appendAudit(state.audit, makeAuditEvent(kind, detail, state.role, state.patientId));
  };

  const setPatient = (id: string) => {
    if (!patientById(id)) return;
    state.patientId = id;
    state.chat = [];
    state.graphSelected = null;
    log("context", `Focused ${id}`);
    writeHash(state.view, state.patientId);
    render();
  };

  const setView = (view: ViewId) => {
    state.view = view;
    state.navOpen = false;
    writeHash(view, state.patientId);
    render();
  };

  const ask = (question: string) => {
    const q = question.trim();
    if (!q) return;
    const reply = answerQuestion(q, patient(), state.role, state.mode);
    state.chat.push({ who: "user", text: q, sourceIds: [] });
    state.chat.push({
      who: "ai",
      text: reply.text,
      sourceIds: reply.sourceIds,
      abstained: reply.abstained
    });
    log("copilot", `${reply.intent}: ${q.slice(0, 80)}`);
    render();
  };

  function renderSidebar(): string {
    return `
      <aside class="sidebar${state.navOpen ? " open" : ""}" aria-label="Primary">
        <div class="logo">
          <div class="logo-mark" aria-hidden="true">N</div>
          <div>NOMI<small>Neural open medical intelligence</small></div>
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
    const result = rankDiagnoses(DIAGNOSES, p.findings, { thorough: state.mode === "thorough" });
    const leadSources = (result.mostLikely?.sourceIds ?? []).map(sourceById).filter(Boolean);
    return `
      <aside class="right-panel${state.panelOpen ? " open" : ""}" aria-label="Evidence">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <strong>Evidence rail</strong>
          <span class="badge badge-cyan">${state.mode === "thorough" ? "Thorough" : "Quick"}</span>
        </div>
        <p class="meta">${escapeHtml(explainForRole(result, state.role))}</p>
        ${leadSources
          .map(
            (s) =>
              `<div class="source"><strong>${escapeHtml(s!.title)}</strong>${escapeHtml(s!.summary)} <a href="${s!.url}" target="_blank" rel="noopener noreferrer">Open source</a></div>`
          )
          .join("")}
        <div class="msg ai">${escapeHtml(
          result.mostLikely
            ? `Draft for ${p.id}: ${result.mostLikely.name}. Ask a follow-up or open Copilot.`
            : "No stable draft. Gather findings."
        )}</div>
        <form class="btn-row" data-form="rail">
          <input name="q" type="text" placeholder="Ask about this chart…" aria-label="Ask the evidence rail" />
          <button class="btn" type="submit">Send</button>
        </form>
      </aside>`;
  }

  function renderDashboard(): string {
    const p = patient();
    const result = rankDiagnoses(DIAGNOSES, p.findings, { thorough: true });
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
    const insightKey = `${p.id}-insight`;
    const status = state.insight[insightKey] ?? "pending";
    const most = result.ranked.filter((d) => d.band === "strong" || d === result.ranked[0]);
    const expanded = result.ranked.filter((d) => d.band === "possible");
    const miss = result.cannotMiss;

    return `
      <div class="grid-2">
        <div>
          <div class="card">
            <h3>Working assessment <span class="badge badge-${result.confidence === "high" ? "high" : result.confidence === "low" || result.confidence === "abstain" ? "low" : "med"}">${escapeHtml(result.confidence)}</span></h3>
            <div class="meta">${p.id} · ${p.ageYears}y · ${p.sex} · MRN ${p.mrn} · ${p.unit} · admitted ${p.admitHoursAgo}h</div>
            <p style="margin:10px 0 8px;line-height:1.55">${escapeHtml(explainForRole(result, state.role))}</p>
            <div class="chips">${p.problems.map((x) => `<span class="chip">${escapeHtml(x)}</span>`).join("")}</div>
            <div class="vitals">
              <div class="vital"><div class="val">${p.vitals.bpSys}/${p.vitals.bpDia}</div><div class="lbl">BP</div></div>
              <div class="vital"><div class="val">${p.vitals.hr}</div><div class="lbl">HR</div></div>
              <div class="vital"><div class="val">${p.vitals.spo2}%</div><div class="lbl">SpO₂</div></div>
              <div class="vital"><div class="val">${news.value}</div><div class="lbl">${news.name.split(" ")[0]}</div></div>
            </div>
            <div class="btn-row">
              <button class="btn" data-act="accept" data-id="${insightKey}">Accept draft</button>
              <button class="btn-ghost" data-act="defer" data-id="${insightKey}">Defer</button>
              <button class="btn-danger" data-act="override" data-id="${insightKey}">Override</button>
              <span class="badge badge-cyan">Status: ${actionLabel(status)}</span>
            </div>
            <p class="meta" style="margin-top:8px">Worlds evaluated: ${result.worldsEvaluated}. Draft only — not an order.</p>
          </div>
          <div class="card">
            <h3>Differential <span class="badge badge-cyan">Cited</span></h3>
            <strong class="meta">Most likely</strong>
            ${most.map((d) => dxRow(d)).join("")}
            ${expanded.length ? `<strong class="meta">Expanded</strong>${expanded.map((d) => dxRow(d)).join("")}` : ""}
            ${miss.length ? `<strong class="meta">Cannot miss</strong>${miss.map((d) => dxRow(d)).join("")}` : ""}
          </div>
        </div>
        <div>
          <div class="card">
            <h3>Key labs</h3>
            ${p.labs
              .map(
                (l) =>
                  `<div class="row"><span>${escapeHtml(l.name)}</span><strong>${l.value} ${escapeHtml(l.unit)} ${l.flag === "normal" ? "" : l.flag === "high" ? "↑" : "↓"}</strong></div>`
              )
              .join("")}
          </div>
          <div class="card">
            <h3>Medication safety</h3>
            ${
              interactions.length
                ? interactions
                    .map(
                      (a) =>
                        `<div class="alert ${a.severity === "moderate" ? "moderate" : ""}"><strong>${escapeHtml(a.drugs.join(" + "))} · ${a.severity}</strong><br/>${escapeHtml(a.mechanism)}<br/><em>${escapeHtml(a.management)}</em>${
                          a.modifiers.length ? `<div class="meta">${escapeHtml(a.modifiers.join(" · "))}</div>` : ""
                        }</div>`
                    )
                    .join("")
                : `<p class="meta">No coded pair fired. Incomplete formulary — not a safety clearance.</p>`
            }
            <div class="meta" style="margin-top:8px">Regimen: ${p.meds.map((m) => escapeHtml(`${m.name} ${m.dose}`)).join(" · ")}</div>
          </div>
          <div class="card">
            <h3>Similar cohort (synthetic)</h3>
            <p>${escapeHtml(p.similar.label)}</p>
            <p class="meta">n=${p.similar.n} · ${escapeHtml(p.similar.outcome)} · ${escapeHtml(p.similar.interval)}</p>
            <p class="meta">${escapeHtml(p.similar.freshness)}</p>
          </div>
          <div class="card">
            <h3>FHIR-shaped chips</h3>
            <div class="chips">${p.fhir.map((c) => `<span class="chip">${c.resourceType} · ${escapeHtml(c.label)}</span>`).join("")}</div>
          </div>
          ${
            state.role === "student"
              ? `<div class="card"><h3>Teaching pearl</h3><p>${escapeHtml(p.teachingPearl)}</p></div>`
              : ""
          }
          ${
            state.role === "researcher"
              ? `<div class="card"><h3>Trial / literature notes</h3><ul>${p.trialHints.map((t) => `<li>${escapeHtml(t)}</li>`).join("")}</ul></div>`
              : ""
          }
        </div>
      </div>`;
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
    const turns =
      state.chat.length === 0
        ? `<div class="msg ai">Ask a chart-grounded question. Try “most likely diagnosis”, “drug interactions”, or “sources”. Thorough mode enumerates ${1 << Math.min(14, patient().findings.filter((f) => f.polarity !== "unknown").length)} finding-flip worlds.</div>`
        : state.chat
            .map((t) => {
              const sources = t.sourceIds
                .map(sourceById)
                .filter(Boolean)
                .map((s) => `<div class="source"><strong>${escapeHtml(s!.title)}</strong><a href="${s!.url}" target="_blank" rel="noopener noreferrer">${escapeHtml(s!.url)}</a></div>`)
                .join("");
              return `<div class="msg ${t.who}${t.abstained ? " ab" : ""}">${escapeHtml(t.text)}</div>${sources}`;
            })
            .join("");
    return `<div class="card">
      <h3>NOMI copilot
        <span>
          <button class="btn-ghost" data-mode="quick">Quick</button>
          <button class="btn-ghost" data-mode="thorough">Thorough</button>
        </span>
      </h3>
      <div id="thread">${turns}</div>
      <form class="btn-row" data-form="copilot" style="margin-top:12px">
        <input name="q" type="text" placeholder="Ask about this patient or the local catalog…" aria-label="Copilot question" />
        <button class="btn" type="submit">Send</button>
      </form>
    </div>`;
  }

  function renderGraph(): string {
    const p = patient();
    const { nodes, edges } = buildGraph(p);
    const laid: LaidOutNode[] = layoutGraph(nodes, edges, 720, 400, 220);
    const selected = state.graphSelected;
    const neighbor = selected ? new Set(neighborsOf(selected, edges)) : null;
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
        const dim = selected && n.id !== selected && !neighbor?.has(n.id) ? 0.25 : 1;
        return `<g data-node="${escapeHtml(n.id)}" opacity="${dim}" style="cursor:pointer">
          <circle cx="${n.x}" cy="${n.y}" r="8" fill="${color}"></circle>
          <text class="node-label" x="${n.x + 10}" y="${n.y + 4}">${escapeHtml(n.label)}</text>
        </g>`;
      })
      .join("");
    const detail = selected
      ? `<p class="meta">Selected <strong>${escapeHtml(selected)}</strong> · neighbors: ${escapeHtml([...neighborsOf(selected, edges)].join(", ") || "none")}</p>`
      : `<p class="meta">Click a node. Layout used 220 cooling ticks (quality over speed).</p>`;
    return `<div class="card"><h3>Patient data ↔ diagnoses ↔ sources</h3>
      <div class="graph-wrap"><svg viewBox="0 0 720 400">${lines}${circles}</svg></div>
      ${detail}
    </div>`;
  }

  function renderPatients(): string {
    const units = ["", ...new Set(PATIENTS.map((p) => p.unit))];
    const rows = filterPatients(PATIENTS, state.rosterQuery, state.rosterUnit);
    return `<div class="card">
      <h3>Demo roster <span class="badge badge-cyan">${rows.length}</span></h3>
      <div class="btn-row">
        <input id="roster-q" type="search" value="${escapeHtml(state.rosterQuery)}" placeholder="Filter by id, problem, concern…" aria-label="Filter roster" />
        <select id="roster-unit">${units.map((u) => `<option value="${escapeHtml(u)}" ${u === state.rosterUnit ? "selected" : ""}>${u || "All units"}</option>`).join("")}</select>
      </div>
      <table class="table">
        <thead><tr><th>Chart</th><th>Concern</th><th>Unit</th><th>Lead draft</th><th></th></tr></thead>
        <tbody>
          ${rows
            .map((p) => {
              const lead = rankDiagnoses(DIAGNOSES, p.findings, { thorough: false }).mostLikely;
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
      </table>
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
        <div class="card"><h3>${escapeHtml(news.name)}</h3><div class="val" style="font-size:28px">${news.value}<span class="meta"> / ${news.max}</span></div><span class="badge badge-${news.band === "low" ? "high" : news.band === "moderate" ? "med" : "low"}">${news.band}</span></div>
        <div class="card"><h3>${escapeHtml(hf.name)}</h3><div style="font-size:28px">${hf.value}<span class="meta"> / ${hf.max}</span></div><span class="badge badge-med">${hf.band}</span></div>
        <div class="card"><h3>Anomalies (MAD)</h3><div style="font-size:28px">${anomalies.length}</div><div class="meta">Robust z ≥ 3.2</div></div>
      </div>
      <div class="card">
        <h3>24-hour traces</h3>
        <div class="grid-2">
          <div>HR ${sparkline(p.series.map((s) => s.hr))}</div>
          <div>SpO₂ ${sparkline(p.series.map((s) => s.spo2), true)}</div>
          <div>RR ${sparkline(p.series.map((s) => s.rr))}</div>
          <div>SBP ${sparkline(p.series.map((s) => s.sbp), true)}</div>
        </div>
      </div>
      <div class="card">
        <h3>Closed-loop alerts</h3>
        ${
          anomalies.length === 0
            ? `<p class="meta">No robust outliers on this synthetic trace.</p>`
            : anomalies
                .slice(0, 6)
                .map((a, i) => {
                  const id = `${p.id}-${a.metric}-${a.index}-${i}`;
                  const st = state.alerts[id] ?? "open";
                  return `<div class="row">
                    <div>${escapeHtml(a.message)}<div class="meta">${a.severity} · hour ${a.index}</div></div>
                    <div class="btn-row">
                      <span class="badge badge-med">${st}</span>
                      <button class="btn-ghost" data-alert="acknowledged" data-id="${id}">Acknowledge</button>
                      <button class="btn-danger" data-alert="escalated" data-id="${id}">Escalate</button>
                    </div>
                  </div>`;
                })
                .join("")
        }
      </div>`;
  }

  function renderMessages(): string {
    const p = patient();
    return `<div class="card"><h3>Threads</h3>
      ${p.threads
        .map((t) => {
          const released = state.released.includes(t.id);
          return `<div class="thread">
            <strong>${escapeHtml(t.subject)}</strong>
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
    </div>`;
  }

  function renderAudit(): string {
    const rows = filterAudit(state.audit, state.auditQuery);
    return `<div class="card">
      <h3>Immutable session log</h3>
      <input id="audit-q" type="search" value="${escapeHtml(state.auditQuery)}" placeholder="Filter events…" aria-label="Filter audit" />
      <table class="table">
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
      </table>
    </div>`;
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
    const body =
      state.view === "dashboard"
        ? renderDashboard()
        : state.view === "copilot"
          ? renderCopilot()
          : state.view === "graph"
            ? renderGraph()
            : state.view === "patients"
              ? renderPatients()
              : state.view === "monitoring"
                ? renderMonitoring()
                : state.view === "messages"
                  ? renderMessages()
                  : renderAudit();

    root.innerHTML = `
      <div class="disclaimer-bar">NOMI is a demonstration prototype. <strong>Not medical advice</strong>, not a diagnosis, not a medical device, and not a substitute for a licensed clinician. Human review is required before any documentation, order, prescription, or patient message.</div>
      <div class="app">
        ${renderSidebar()}
        <main class="main" id="main">
          <div class="mobile-bar">
            <button class="btn-ghost" data-cmd="nav">Menu</button>
            <button class="btn-ghost" data-cmd="panel">Evidence</button>
          </div>
          <div class="header">
            <div>
              <h1>${TITLES[state.view]}</h1>
              <div class="meta">${p.id} · ${p.ageYears}y / ${p.sex[0].toUpperCase()} · MRN ${p.mrn} · ${escapeHtml(p.chiefConcern)}</div>
            </div>
            <div class="live-pill">NOMI-3 demo · ${state.role}</div>
          </div>
          ${body}
          <p class="footer-note">© Demo workspace · <a href="https://www.hl7.org/fhir/" target="_blank" rel="noopener noreferrer">FHIR</a> · <a href="https://www.fda.gov/regulatory-information/search-fda-guidance-documents/clinical-decision-support-software" target="_blank" rel="noopener noreferrer">FDA CDS guidance</a> · See README for the full disclaimer. No personal names in this roster.</p>
        </main>
        ${renderPanel()}
      </div>
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
        if (input) ask(input.value);
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
      g.addEventListener("click", () => {
        state.graphSelected = g.getAttribute("data-node");
        render();
      });
    });
    root.querySelector("#roster-q")?.addEventListener("input", (e) => {
      state.rosterQuery = (e.target as HTMLInputElement).value;
      render();
      const el = document.getElementById("roster-q") as HTMLInputElement | null;
      if (el) {
        el.focus();
        el.setSelectionRange(state.rosterQuery.length, state.rosterQuery.length);
      }
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
      render();
      document.getElementById("audit-q")?.focus();
    });
    root.querySelectorAll<HTMLButtonElement>("[data-cmd]").forEach((btn) => {
      btn.addEventListener("click", () => {
        if (btn.dataset.cmd === "palette") state.commandOpen = true;
        if (btn.dataset.cmd === "nav") state.navOpen = !state.navOpen;
        if (btn.dataset.cmd === "panel") state.panelOpen = !state.panelOpen;
        render();
        document.getElementById("palette-q")?.focus();
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
      render();
      const el = document.getElementById("palette-q") as HTMLInputElement | null;
      if (el) {
        el.focus();
        el.setSelectionRange(state.commandQuery.length, state.commandQuery.length);
      }
    });
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
    }
    render();
  });

  window.addEventListener("keydown", (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
      e.preventDefault();
      state.commandOpen = true;
      render();
      document.getElementById("palette-q")?.focus();
    }
    if (e.key === "Escape" && state.commandOpen) {
      state.commandOpen = false;
      render();
    }
  });

  render();
}
