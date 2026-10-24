// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const reasoner = vi.hoisted(() => ({ fail: false }));

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

describe("empty states", () => {
  it("offers to clear a roster filter that matches nothing", () => {
    const root = start("#/patients/P-88472");
    const input = root.querySelector<HTMLInputElement>("#roster-q")!;
    input.value = "zzz";
    input.dispatchEvent(new Event("input"));
    expect(root.querySelector(".empty-state")?.textContent).toContain("No charts match");
    root.querySelector<HTMLButtonElement>("[data-clear=roster]")!.click();
    expect(root.querySelectorAll("tbody tr").length).toBe(5);
  });
});
