import { describe, expect, it } from "vitest";
import { PATIENTS } from "../src/data/patients";
import { appendAudit, filterAudit, makeAuditEvent } from "../src/engine/audit";
import { answerQuestion, detectIntent } from "../src/engine/copilot";
import { layoutGraph, neighborsOf } from "../src/engine/graph";
import { filterPatients, searchAll } from "../src/engine/search";

describe("copilot", () => {
  it("routes intents", () => {
    expect(detectIntent("show the differential")).toBe("differential");
    expect(detectIntent("any drug interactions?")).toBe("interactions");
    expect(detectIntent("is this a medical device?")).toBe("safety");
    expect(detectIntent("")).toBe("empty");
  });

  it("answers a differential question with citations and does not order therapy", () => {
    const reply = answerQuestion("most likely diagnosis", PATIENTS[0], "clinician", "thorough");
    expect(reply.abstained).toBe(false);
    expect(reply.sourceIds.length).toBeGreaterThan(0);
    expect(reply.text).toMatch(/heart failure/i);
    expect(reply.text).not.toMatch(/I have ordered/i);
  });

  it("abstains on an empty prompt", () => {
    const reply = answerQuestion("   ", PATIENTS[0], "clinician", "quick");
    expect(reply.abstained).toBe(true);
  });

  it("surfaces the ACE + spironolactone pair", () => {
    const reply = answerQuestion("drug interaction potassium", PATIENTS[0], "clinician", "quick");
    expect(reply.text.toLowerCase()).toMatch(/spironolactone/);
  });
});

describe("search and roster", () => {
  it("finds a patient by id and a guideline by token", () => {
    const hits = searchAll("88472 heart failure guideline");
    expect(hits.some((h) => h.kind === "patient" && h.id === "P-88472")).toBe(true);
    expect(hits.some((h) => h.kind === "source")).toBe(true);
  });

  it("filters the roster by unit and query", () => {
    const only = filterPatients(PATIENTS, "ketoacidosis", "");
    expect(only.map((p) => p.id)).toEqual(["P-44108"]);
    const cards = filterPatients(PATIENTS, "", "Cardiology step-down");
    expect(cards).toHaveLength(1);
  });
});

describe("audit", () => {
  it("appends immutable events and filters them", () => {
    const a = makeAuditEvent("accept", "Accepted ADHF insight", "clinician", "P-88472");
    const b = makeAuditEvent("override", "Overrode ACS rank", "student", "P-10955");
    const log = appendAudit(appendAudit([], a), b);
    expect(log).toHaveLength(2);
    expect(filterAudit(log, "override")).toHaveLength(1);
    expect(filterAudit(log, "P-88472")[0].kind).toBe("accept");
  });
});

describe("graph layout", () => {
  it("keeps nodes inside the canvas and honors edges", () => {
    const nodes = [
      { id: "a", label: "A", kind: "finding" as const },
      { id: "b", label: "B", kind: "diagnosis" as const },
      { id: "c", label: "C", kind: "source" as const }
    ];
    const edges = [
      { from: "a", to: "b", label: "supports" },
      { from: "b", to: "c", label: "cited" }
    ];
    const laid = layoutGraph(nodes, edges, 400, 300, 40);
    expect(laid).toHaveLength(3);
    for (const n of laid) {
      expect(n.x).toBeGreaterThanOrEqual(24);
      expect(n.x).toBeLessThanOrEqual(376);
      expect(Number.isFinite(n.x)).toBe(true);
    }
    expect(neighborsOf("b", edges).sort()).toEqual(["a", "c"]);
  });
});
