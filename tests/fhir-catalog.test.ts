import { describe, expect, it } from "vitest";
import { DIAGNOSES, SOURCES, sourceById } from "../src/data/catalog";
import { PATIENTS } from "../src/data/patients";
import {
  buildFhirBundle,
  bundleResourceCounts,
  fhirFilename,
  parseFhirBundle,
  serializeFhirBundle
} from "../src/engine/fhir";

describe("evidence catalog integrity", () => {
  it("resolves every diagnosis sourceId to a catalog entry", () => {
    for (const dx of DIAGNOSES) {
      expect(dx.sourceIds.length).toBeGreaterThan(0);
      for (const id of dx.sourceIds) {
        expect(sourceById(id), `${dx.id} cites missing ${id}`).toBeTruthy();
      }
    }
  });

  it("keeps catalog source ids unique", () => {
    const ids = SOURCES.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("FHIR export", () => {
  it("builds a collection Bundle and round-trips P-88472", () => {
    const patient = PATIENTS[0];
    const bundle = buildFhirBundle(patient, new Date("2026-10-21T12:00:00.000Z"));
    expect(bundle.resourceType).toBe("Bundle");
    expect(bundle.type).toBe("collection");
    expect(bundle.meta.tag[0].code).toBe("synthetic");

    const counts = bundleResourceCounts(bundle);
    expect(counts.Patient).toBe(1);
    expect(counts.Condition).toBe(patient.problems.length);
    // Labs, one blood pressure panel, and five single-value vital signs.
    expect(counts.Observation).toBe(patient.labs.length + 6);
    expect(counts.MedicationRequest).toBe(patient.meds.length);
    expect(counts.AllergyIntolerance).toBe(patient.allergies.length);

    const json = serializeFhirBundle(bundle);
    const parsed = parseFhirBundle(JSON.parse(json));
    expect(parsed.patientId).toBe(patient.id);
    expect(parsed.mrn).toBe(patient.mrn);
    expect(parsed.gender).toBe("male");
    expect(parsed.ageYears).toBe(68);
    expect(parsed.problems).toEqual(patient.problems);
    expect(parsed.labs.map((l) => l.name)).toEqual(patient.labs.map((l) => l.name));
    expect(parsed.labs.map((l) => l.value)).toEqual(patient.labs.map((l) => l.value));
    expect(parsed.meds).toEqual(patient.meds.map((m) => ({
      name: m.name,
      dose: m.dose,
      route: m.route,
      schedule: m.schedule
    })));
    expect(parsed.allergies).toEqual(patient.allergies);
    expect(parsed.vitals.find((v) => v.name === "Systolic blood pressure")?.value).toBe(128);
    expect(parsed.vitals.find((v) => v.name === "Diastolic blood pressure")?.value).toBe(76);
    expect(json).not.toMatch(/Robert|Alex|Ellis|Morgan/i);
  });

  it("round-trips every demo chart without inventing names", () => {
    for (const patient of PATIENTS) {
      const slice = parseFhirBundle(serializeFhirBundle(buildFhirBundle(patient)));
      expect(slice.patientId).toBe(patient.id);
      expect(slice.mrn).toBe(patient.mrn);
      expect(slice.problems).toEqual(patient.problems);
      expect(slice.allergies).toEqual(patient.allergies);
      expect(slice.labs).toHaveLength(patient.labs.length);
      expect(slice.vitals).toHaveLength(7);
      expect(slice.meds.map((m) => m.name)).toEqual(patient.meds.map((m) => m.name));
    }
  });

  it("rejects JSON that is not a collection Bundle", () => {
    expect(() => parseFhirBundle({ resourceType: "Patient", id: "x" })).toThrow(/Bundle/);
    expect(() => parseFhirBundle({ resourceType: "Bundle", type: "transaction", entry: [] })).toThrow(/collection/);
    expect(() => parseFhirBundle({ resourceType: "Bundle", type: "collection", entry: [] })).toThrow(/Patient/);
  });

  it("names the download from the chart id", () => {
    expect(fhirFilename("P-88472")).toBe("p-88472-fhir-bundle.json");
  });
});
