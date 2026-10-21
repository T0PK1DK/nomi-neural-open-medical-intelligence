import type { AuditEvent, Role } from "../types";

let seq = 0;

export function makeAuditEvent(
  kind: string,
  detail: string,
  role: Role,
  patientId?: string
): AuditEvent {
  seq += 1;
  return {
    id: `evt-${seq.toString().padStart(4, "0")}`,
    at: new Date().toISOString(),
    kind,
    detail,
    patientId,
    role
  };
}

export function appendAudit(log: AuditEvent[], event: AuditEvent): AuditEvent[] {
  return [...log, event];
}

export function filterAudit(
  log: AuditEvent[],
  query: string
): AuditEvent[] {
  const q = query.trim().toLowerCase();
  if (!q) return log;
  return log.filter((e) =>
    [e.kind, e.detail, e.patientId ?? "", e.role].join(" ").toLowerCase().includes(q)
  );
}
