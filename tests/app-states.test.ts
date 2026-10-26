// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
// @ts-expect-error Node built-ins are available in Vitest; this tsconfig only lists vite/client.
import { readFileSync } from "node:fs";

const reasoner = vi.hoisted(() => ({ fail: false }));
const graph = vi.hoisted(() => ({ fail: false }));

vi.mock("../src/engine/reasoner", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/engine/reasoner")>();
  return {
    ...actual,
    rankDiagnoses: vi.fn((...args: Parameters<typeof actual.rankDiagnoses>) => {
      if (reasoner.fail) throw new Error("Reasoner offline");
      return actual.rankDiagnoses(...args);
    })
  };
});

vi.mock("../src/engine/graph", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/engine/graph")>();
  return {
    ...actual,
    layoutGraph: vi.fn((...args: Parameters<typeof actual.layoutGraph>) => {
      if (graph.fail) throw new Error("Graph layout failed");
      return actual.layoutGraph(...args);
    })
  };
});

import { mount } from "../src/app";

function start(hash: string): HTMLElement {
  history.replaceState(null, "", hash);
  document.body.innerHTML = '<div id="app"></div>';
  const root = document.getElementById("app")!;
  mount(root);
  return root;
}

/** Let afterPaint callbacks (requestAnimationFrame → setTimeout) run. */
function flush(): void {
  vi.advanceTimersByTime(50);
}

beforeEach(() => {
  reasoner.fail = false;
  graph.fail = false;
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "requestAnimationFrame", "cancelAnimationFrame"] });
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("dashboard loading and error states", () => {
  it("shows a loading state until the thorough ranking finishes", () => {
    const root = start("#/dashboard/P-88472");
    const loading = root.querySelector(".card-lead .loading");
    expect(loading?.getAttribute("aria-busy")).toBe("true");
    expect(loading?.textContent).toContain("4,096 finding-flip worlds");
    expect(root.querySelector(".lead-dx")).toBeNull();

    flush();
    expect(root.querySelector(".card-lead .loading")).toBeNull();
    expect(root.querySelector(".lead-dx")?.textContent).toBe("Acute decompensated heart failure");
    expect(root.textContent).toContain("Vitals charted 35 min ago");
  });

  it("shows a recoverable error when the ranking fails", () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    reasoner.fail = true;
    const root = start("#/dashboard/P-88472");
    flush();
    const alert = root.querySelector(".error-state[role=alert]");
    expect(alert?.textContent).toContain("couldn't load");
    expect(alert?.textContent).toContain("Reasoner offline");
    expect(logged).toHaveBeenCalled();

    reasoner.fail = false;
    root.querySelector<HTMLButtonElement>("[data-retry]")!.click();
    flush();
    expect(root.querySelector(".error-state")).toBeNull();
    expect(root.querySelector(".lead-dx")?.textContent).toBe("Acute decompensated heart failure");
  });

  it("says when a chart has no active problems", () => {
    const root = start("#/dashboard/P-10955");
    flush();
    expect(root.querySelector(".card-lead .chips")?.textContent).toContain("No active problems recorded");
  });
});

describe("FHIR export states", () => {
  it("renders provenance chips that each name an exported resource", async () => {
    const { buildFhirBundle } = await import("../src/engine/fhir");
    const { patientById } = await import("../src/data/patients");
    const root = start("#/dashboard/P-88472");
    flush();
    const refs = [...root.querySelectorAll<HTMLElement>("[data-fhir-ref]")].map((el) => el.dataset.fhirRef);
    const exported = new Set(
      buildFhirBundle(patientById("P-88472")!).entry.map((e) => `${e.resource.resourceType}/${e.resource.id}`)
    );
    expect(refs.length).toBeGreaterThan(0);
    for (const ref of refs) expect(exported.has(ref!)).toBe(true);
    expect(root.textContent).not.toContain("I50.9");
  });

  it("confirms a successful download and logs it", () => {
    URL.createObjectURL = vi.fn(() => "blob:nomi");
    URL.revokeObjectURL = vi.fn();
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    const root = start("#/dashboard/P-88472");
    flush();
    root.querySelector<HTMLButtonElement>("[data-fhir-export]")!.click();
    expect(root.querySelector("[role=status].badge-high")?.textContent).toBe("Saved p-88472-fhir-bundle.json");
    expect(root.querySelector(".error-state")).toBeNull();
  });

  it("reports a failed download instead of claiming success", () => {
    URL.createObjectURL = vi.fn(() => {
      throw new Error("Downloads are blocked");
    });
    const root = start("#/dashboard/P-88472");
    flush();
    root.querySelector<HTMLButtonElement>("[data-fhir-export]")!.click();
    expect(root.querySelector(".error-state[role=alert]")?.textContent).toContain("Downloads are blocked");
    expect(root.textContent).not.toContain("Saved p-88472");
  });

  it("clears the last download when the hash patient changes", () => {
    URL.createObjectURL = vi.fn(() => "blob:nomi");
    URL.revokeObjectURL = vi.fn();
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    const root = start("#/dashboard/P-88472");
    flush();
    root.querySelector<HTMLButtonElement>("[data-fhir-export]")!.click();
    expect(root.querySelector("[role=status].badge-high")?.textContent).toBe("Saved p-88472-fhir-bundle.json");

    history.replaceState(null, "", "#/dashboard/P-22019");
    window.dispatchEvent(new HashChangeEvent("hashchange"));
    flush();
    expect(root.textContent).not.toContain("Saved p-88472");
    expect(root.querySelector("[data-fhir-export]")).toBeTruthy();
  });
});

describe("copilot states", () => {
  function askCopilot(root: HTMLElement, question: string): void {
    root.querySelector<HTMLInputElement>("[data-form=copilot] input")!.value = question;
    root.querySelector<HTMLFormElement>("[data-form=copilot]")!.dispatchEvent(new Event("submit", { cancelable: true }));
  }

  it("shows a pending turn and disables Send while answering", () => {
    const root = start("#/copilot/P-88472");
    askCopilot(root, "most likely diagnosis");
    expect(root.querySelector(".msg.pending")?.getAttribute("aria-busy")).toBe("true");
    expect(root.querySelector<HTMLButtonElement>("[data-form=copilot] button")!.disabled).toBe(true);

    flush();
    expect(root.querySelector(".msg.pending")).toBeNull();
    expect(root.querySelectorAll("#thread .msg.ai")).toHaveLength(1);
    expect(root.querySelector<HTMLButtonElement>("[data-form=copilot] button")!.disabled).toBe(false);
  });

  it("turns a failed answer into a retryable error without duplicating the question", () => {
    reasoner.fail = true;
    const root = start("#/copilot/P-88472");
    askCopilot(root, "most likely diagnosis");
    flush();
    expect(root.querySelector(".msg.error[role=alert]")?.textContent).toContain("Reasoner offline");

    reasoner.fail = false;
    root.querySelector<HTMLButtonElement>("[data-retry-ask]")!.click();
    flush();
    expect(root.querySelector(".msg.error")).toBeNull();
    expect(root.querySelectorAll("#thread .msg.user")).toHaveLength(1);
    expect(root.querySelectorAll("#thread .msg.ai")).toHaveLength(1);
  });
});

describe("monitoring badges", () => {
  it("colors the HF congestion badge from its own band, not a fixed moderate", () => {
    const moderate = start("#/monitoring/P-88472");
    flush();
    const hfModerate = [...moderate.querySelectorAll(".stat")].find((el) => el.textContent?.includes("HF congestion"));
    expect(hfModerate?.querySelector(".badge")?.className).toContain("badge-med");
    expect(hfModerate?.querySelector(".badge")?.textContent).toBe("moderate");

    const low = start("#/monitoring/P-10955");
    flush();
    const hfLow = [...low.querySelectorAll(".stat")].find((el) => el.textContent?.includes("HF congestion"));
    expect(hfLow?.querySelector(".badge")?.className).toContain("badge-high");
    expect(hfLow?.querySelector(".badge")?.textContent).toBe("low");
  });
});

describe("empty states", () => {
  it("offers to clear a roster filter that matches nothing", () => {
    const root = start("#/patients/P-88472");
    flush();
    const input = root.querySelector<HTMLInputElement>("#roster-q")!;
    input.value = "zzz";
    input.dispatchEvent(new Event("input"));
    expect(root.querySelector(".empty-state")?.textContent).toContain("No charts match");
    root.querySelector<HTMLButtonElement>("[data-clear=roster]")!.click();
    expect(root.querySelectorAll("tbody tr").length).toBe(5);
  });
});

describe("every screen: loading, error, empty", () => {
  it("dashboard: loading, Try again, and empty problems", () => {
    const loading = start("#/dashboard/P-88472");
    expect(loading.querySelector(".card-lead .loading")?.textContent).toContain("finding-flip worlds");
    flush();
    expect(loading.querySelector(".lead-dx")).toBeTruthy();

    reasoner.fail = true;
    vi.spyOn(console, "error").mockImplementation(() => {});
    const errored = start("#/dashboard/P-88472");
    flush();
    expect(errored.querySelector(".error-state")?.textContent).toContain("Try again");
    reasoner.fail = false;
    errored.querySelector<HTMLButtonElement>("[data-retry]")!.click();
    flush();
    expect(errored.querySelector(".lead-dx")).toBeTruthy();

    const empty = start("#/dashboard/P-10955");
    flush();
    expect(empty.textContent).toContain("No active problems recorded");
  });

  it("copilot: empty prompt, pending, and Try again", () => {
    const root = start("#/copilot/P-88472");
    expect(root.querySelector(".empty-state")?.textContent).toContain("Ask a chart-grounded question");
    root.querySelector<HTMLInputElement>("[data-form=copilot] input")!.value = "most likely diagnosis";
    root.querySelector<HTMLFormElement>("[data-form=copilot]")!.dispatchEvent(new Event("submit", { cancelable: true }));
    expect(root.querySelector(".msg.pending")?.textContent).toContain("Checking the chart");
    flush();
    expect(root.querySelector(".msg.ai")).toBeTruthy();
  });

  it("graph: loading, empty selection, and Try again after a layout failure", () => {
    const root = start("#/graph/P-88472");
    expect(root.querySelector(".loading")?.textContent).toContain("Laying out the knowledge graph");
    flush();
    expect(root.querySelector(".empty-state")?.textContent).toContain("No node selected");
    expect(root.querySelector(".graph-wrap")).toBeTruthy();

    graph.fail = true;
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    const failed = start("#/graph/P-88472");
    expect(failed.querySelector(".loading")).toBeTruthy();
    flush();
    const alert = failed.querySelector(".error-state[role=alert]");
    expect(alert?.textContent).toContain("Graph layout failed");
    expect(alert?.textContent).toContain("Try again");
    expect(logged).toHaveBeenCalled();
    graph.fail = false;
    failed.querySelector<HTMLButtonElement>("[data-retry]")!.click();
    expect(failed.querySelector(".loading")?.textContent).toContain("Laying out");
    flush();
    expect(failed.querySelector(".error-state")).toBeNull();
    expect(failed.querySelector(".graph-wrap")).toBeTruthy();
  });

  it("patients: loading then the roster", () => {
    const root = start("#/patients/P-88472");
    expect(root.querySelector(".loading")?.textContent).toContain("Loading the demo roster");
    flush();
    expect(root.querySelectorAll("tbody tr").length).toBe(5);
  });

  it("monitoring: loading and an empty or listed alert board", () => {
    const root = start("#/monitoring/P-10955");
    expect(root.querySelector(".loading")?.textContent).toContain("Reading the 24-hour traces");
    flush();
    const empty = root.querySelector(".empty-state");
    const rows = root.querySelectorAll(".card .row");
    expect(Boolean(empty) || rows.length > 0).toBe(true);
    if (empty) expect(empty.textContent).toContain("No alerts");
  });

  it("messages: loading, threads, and a friendly empty filter", () => {
    const root = start("#/messages/P-88472");
    expect(root.querySelector(".loading")?.textContent).toContain("Opening message threads");
    flush();
    expect(root.querySelector(".thread-subject")).toBeTruthy();
    const input = root.querySelector<HTMLInputElement>("#message-q")!;
    input.value = "zzz";
    input.dispatchEvent(new Event("input"));
    expect(root.querySelector(".empty-state")?.textContent).toContain("No threads match");
    root.querySelector<HTMLButtonElement>("[data-clear=messages]")!.click();
    expect(root.querySelector(".thread-subject")).toBeTruthy();
  });

  it("audit: loading and a friendly empty filter", () => {
    const root = start("#/audit/P-88472");
    expect(root.querySelector(".loading")?.textContent).toContain("Opening the session log");
    flush();
    expect(root.querySelector("tbody")).toBeTruthy();
    const input = root.querySelector<HTMLInputElement>("#audit-q")!;
    input.value = "zzz";
    input.dispatchEvent(new Event("input"));
    expect(root.querySelector(".empty-state")?.textContent).toContain("No events match");
    expect(root.querySelector("[data-clear=audit]")?.textContent).toContain("Clear filter");
  });
});

describe("readability and 390px phone", () => {
  it("keeps type at or above 12px and does not force a 520px table", () => {
    const cwd = (globalThis as unknown as { process: { cwd: () => string } }).process.cwd();
    const css = readFileSync(`${cwd}/src/styles.css`, "utf8");
    expect(css).toContain("--fs-xs: 12px");
    const sizes = [...css.matchAll(/font-size:\s*([0-9.]+)px/gi)].map((m) => Number(m[1]));
    expect(sizes.length).toBeGreaterThan(0);
    expect(Math.min(...sizes)).toBeGreaterThanOrEqual(12);
    expect(css).not.toMatch(/min-width:\s*520px/);
  });

  it("marks each primary screen and wraps wide tables", () => {
    const screens = ["dashboard", "copilot", "graph", "patients", "monitoring", "messages", "audit"] as const;
    for (const view of screens) {
      const root = start(`#/${view}/P-88472`);
      flush();
      expect(root.querySelector("main")?.getAttribute("data-screen")).toBe(view);
      expect(root.textContent).toMatch(/Not medical advice/);
    }
    const roster = start("#/patients/P-88472");
    flush();
    expect(roster.querySelector(".table-wrap")).toBeTruthy();
  });
});
