export type Role = "clinician" | "student" | "researcher";

export type ViewId =
  | "dashboard"
  | "copilot"
  | "graph"
  | "patients"
  | "monitoring"
  | "messages"
  | "audit";

export type Sex = "female" | "male" | "unspecified";

export type InsightAction = "pending" | "accepted" | "overridden" | "deferred";

export type AlertAction = "open" | "acknowledged" | "escalated";

export type Severity = "low" | "moderate" | "high" | "critical";

export type EvidenceGrade = "A" | "B" | "C" | "expert";

export type FindingPolarity = "present" | "absent" | "unknown";

export interface Finding {
  id: string;
  label: string;
  polarity: FindingPolarity;
}

export interface Lab {
  id: string;
  name: string;
  value: number;
  unit: string;
  /** Inclusive lower bound of the demo reference range (Observation.referenceRange.low). */
  refLow: number;
  /** Inclusive upper bound of the demo reference range (Observation.referenceRange.high). */
  refHigh: number;
  /** Analytic flag exported as v3-ObservationInterpretation L / N / H. */
  flag: "low" | "normal" | "high";
}

export interface Medication {
  name: string;
  dose: string;
  route: string;
  schedule: string;
}

export interface Source {
  id: string;
  title: string;
  kind: "guideline" | "trial" | "review" | "label" | "standard";
  publisher: string;
  year: number;
  grade: EvidenceGrade;
  url: string;
  summary: string;
}

export interface DiagnosisModel {
  id: string;
  name: string;
  prior: number;
  cannotMiss: boolean;
  likelihoods: Record<string, { present: number; absent: number }>;
  nextSteps: string[];
  againstWhen: string[];
  sourceIds: string[];
}

export interface RankedDiagnosis {
  id: string;
  name: string;
  prior: number;
  posterior: number;
  logOdds: number;
  cannotMiss: boolean;
  drivers: { findingId: string; label: string; deltaLogOdds: number }[];
  stability: number;
  nextSteps: string[];
  against: string[];
  sourceIds: string[];
  band: "strong" | "possible" | "low" | "cannot-miss";
}

export interface ReasonerResult {
  ranked: RankedDiagnosis[];
  mostLikely: RankedDiagnosis | null;
  cannotMiss: RankedDiagnosis[];
  confidence: "high" | "moderate" | "low" | "abstain";
  confidenceWhy: string;
  missing: string[];
  worldsEvaluated: number;
}

export interface InteractionAlert {
  drugs: string[];
  severity: Severity;
  mechanism: string;
  management: string;
  modifiers: string[];
}

export interface RiskScore {
  name: string;
  value: number;
  max: number;
  band: Severity;
  components: { label: string; points: number }[];
}

export interface MonitoringPoint {
  t: number;
  hr: number;
  rr: number;
  spo2: number;
  sbp: number;
}

export interface Anomaly {
  metric: "hr" | "rr" | "spo2" | "sbp";
  index: number;
  value: number;
  z: number;
  message: string;
  severity: Severity;
}

export interface MessageThread {
  id: string;
  subject: string;
  audience: "care-team" | "patient-draft";
  unread: boolean;
  needsReview: boolean;
  body?: string;
  draft?: string;
}

export interface AuditEvent {
  id: string;
  at: string;
  kind: string;
  detail: string;
  patientId?: string;
  role: Role;
}

/** Provenance chip derived from an exported FHIR resource (see `fhirChips` in src/engine/fhir.ts). */
export interface FhirChip {
  resourceType: "Patient" | "Condition" | "Observation" | "MedicationRequest" | "AllergyIntolerance";
  id: string;
  label: string;
}

export interface SimilarCohort {
  label: string;
  n: number;
  outcome: string;
  interval: string;
  freshness: string;
}

export interface GraphNode {
  id: string;
  label: string;
  kind: "patient" | "finding" | "diagnosis" | "drug" | "source" | "trial";
}

export interface GraphEdge {
  from: string;
  to: string;
  label: string;
}

export interface Patient {
  id: string;
  ageYears: number;
  sex: Sex;
  unit: string;
  admitHoursAgo: number;
  mrn: string;
  chiefConcern: string;
  problems: string[];
  allergies: string[];
  meds: Medication[];
  vitals: {
    bpSys: number;
    bpDia: number;
    hr: number;
    rr: number;
    spo2: number;
    tempC: number;
    weightKg: number;
    /** Minutes before "now" that this vitals set was charted. */
    takenMinutesAgo: number;
  };
  /** Minutes before "now" that the current lab panel was drawn. */
  labsDrawnMinutesAgo: number;
  labs: Lab[];
  findings: Finding[];
  series: MonitoringPoint[];
  notes: string[];
  threads: MessageThread[];
  similar: SimilarCohort;
  teachingPearl: string;
  trialHints: string[];
}

export type CopilotMode = "quick" | "thorough";

export interface CopilotReply {
  text: string;
  sourceIds: string[];
  abstained: boolean;
  intent: string;
  worldsEvaluated?: number;
}
