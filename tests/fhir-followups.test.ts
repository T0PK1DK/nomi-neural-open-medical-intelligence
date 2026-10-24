// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { PATIENTS, patientById } from "../src/data/patients";
import {
  buildFhirBundle,
  escapeXhtml,
  fhirChips,
  narrative,
  parseFhirBundle,
  type FhirBundle
} from "../src/engine/fhir";
import type { Patient } from "../src/types";

const NOW = new Date("2026-10-21T12:00:00.000Z");
const INTERP = "http://terminology.hl7.org/CodeSystem/v3-ObservationInterpretation";
const UCUM = "http://unitsofmeasure.org";
const XHTML = "http://www.w3.org/1999/xhtml";
const bundles = PATIENTS.map((p) => ({ patient: p, bundle: buildFhirBundle(p, NOW) }));

function res(bundle: FhirBundle, id: string): Record<string, any> {
  const hit = bundle.entry.find((e) => e.resource.id === id);
  if (!hit) throw new Error(`missing ${id}`);
  return hit.resource as Record<string, any>;
}

describe("lab reference ranges and interpretation", () => {
  it.each(bundles)("exports referenceRange and an L/N/H interpretation for every lab of $patient.id", ({ patient, bundle }) => {
    for (const lab of patient.labs) {
      const obs = res(bundle, `${patient.id}-lab-${lab.id}`);
      const code = { low: "L", normal: "N", high: "H" }[lab.flag];
      expect(obs.interpretation).toHaveLength(1);
      expect(obs.interpretation[0].coding).toEqual([
        { system: INTERP, code, display: { L: "Low", N: "Normal", H: "High" }[code] }
      ]);
      const range = obs.referenceRange[0];
      expect(range.text).toContain(`${lab.refLow}–${lab.refHigh}`);
      if (obs.valueQuantity.system === UCUM) {
        expect(range.low).toEqual({ ...range.low, value: lab.refLow, system: UCUM, code: obs.valueQuantity.code });
        expect(range.high).toEqual({ ...range.high, value: lab.refHigh, system: UCUM, code: obs.valueQuantity.code });
      } else {
        expect(range.low).toBeUndefined();
        expect(range.high).toBeUndefined();
      }
    }
  });

  it("falls back to a text-only range when the unit has no UCUM mapping", () => {
    const base = patientById("P-88472")!;
    const odd: Patient = {
      ...base,
      labs: [{ id: "x", name: "Demo index", value: 3, unit: "arb units", refLow: 1, refHigh: 2, flag: "high" }]
    };
    const obs = res(buildFhirBundle(odd, NOW), "P-88472-lab-x");
    expect(obs.referenceRange).toEqual([{ text: "1–2 arb units" }]);
    const parsed = parseFhirBundle(buildFhirBundle(odd, NOW));
    expect(parsed.labs[0]).toMatchObject({ refLow: 1, refHigh: 2, flag: "high" });
  });

  it.each(bundles)("round-trips ranges and flags through parseFhirBundle for $patient.id", ({ patient, bundle }) => {
    const parsed = parseFhirBundle(JSON.parse(JSON.stringify(bundle)));
    expect(parsed.labs.map((l) => ({ refLow: l.refLow, refHigh: l.refHigh, flag: l.flag, value: l.value }))).toEqual(
      patient.labs.map((l) => ({ refLow: l.refLow, refHigh: l.refHigh, flag: l.flag, value: l.value }))
    );
    expect(parsed.vitals.every((v) => v.flag === undefined)).toBe(true);
  });

  it("still imports an older export with no range, interpretation or narrative", () => {
    const bundle = JSON.parse(JSON.stringify(buildFhirBundle(patientById("P-88472")!, NOW)));
    for (const e of bundle.entry) {
      delete e.resource.referenceRange;
      delete e.resource.interpretation;
      delete e.resource.text;
    }
    const parsed = parseFhirBundle(bundle);
    expect(parsed.labs.length).toBe(patientById("P-88472")!.labs.length);
    expect(parsed.labs.every((l) => l.flag === undefined && l.refLow === undefined)).toBe(true);
  });
});

describe("generated narrative", () => {
  it.each(bundles)("gives every resource in $patient.id a one-line, well-formed XHTML div", ({ bundle }) => {
    for (const { resource } of bundle.entry) {
      const text = (resource as Record<string, any>).text;
      expect(text.status).toBe("generated");
      const parsed = new DOMParser().parseFromString(text.div, "application/xml");
      expect(parsed.getElementsByTagName("parsererror")).toHaveLength(0);
      expect(parsed.documentElement.namespaceURI).toBe(XHTML);
      expect(parsed.documentElement.localName).toBe("div");
      expect(parsed.documentElement.children).toHaveLength(0);
      expect(parsed.documentElement.textContent!.trim().length).toBeGreaterThan(0);
      expect(parsed.documentElement.textContent).not.toContain("\n");
    }
  });

  it("escapes markup in narrative text", () => {
    expect(escapeXhtml(`<b>&"'`)).toBe("&lt;b&gt;&amp;&quot;&#39;");
    expect(narrative("a < b & c").div).toBe(`<div xmlns="${XHTML}">a &lt; b &amp; c</div>`);
    const base = patientById("P-88472")!;
    const nasty: Patient = { ...base, problems: ["<script>alert(1)</script> & co"] };
    const cond = buildFhirBundle(nasty, NOW).entry.find((e) => e.resource.resourceType === "Condition")!;
    const div = (cond.resource as Record<string, any>).text.div as string;
    expect(div).not.toContain("<script>");
    expect(div).toContain("&lt;script&gt;");
  });
});

describe("provenance chips", () => {
  it.each(bundles)("every chip for $patient.id points at a resource in the export", ({ patient, bundle }) => {
    const chips = fhirChips(patient, NOW);
    const ids = new Set(bundle.entry.map((e) => `${e.resource.resourceType}/${e.resource.id}`));
    expect(chips.length).toBeGreaterThan(0);
    for (const chip of chips) expect(ids.has(`${chip.resourceType}/${chip.id}`)).toBe(true);
    expect(chips.filter((c) => c.resourceType === "Condition").map((c) => c.label)).toEqual(
      patient.problems.map((p) => `Problem: ${p}`)
    );
    expect(chips.filter((c) => c.resourceType === "MedicationRequest")).toHaveLength(patient.meds.length);
    expect(chips.filter((c) => c.resourceType === "AllergyIntolerance")).toHaveLength(patient.allergies.length);
  });

  it("no longer carries a hand-written fhir field on charts", () => {
    for (const p of PATIENTS) expect("fhir" in p).toBe(false);
  });
});
