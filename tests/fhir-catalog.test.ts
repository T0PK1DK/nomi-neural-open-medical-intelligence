import { describe, expect, it } from "vitest";
import { DIAGNOSES, SOURCES, sourceById } from "../src/data/catalog";
import { PATIENTS } from "../src/data/patients";
import {
  FHIR_BASE,
  buildFhirBundle,
  bundleResourceCounts,
  fhirFilename,
  parseFhirBundle,
  serializeFhirBundle,
  validateFhirR4Bundle
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

  it("emits FHIR R4-valid resources for every demo chart", () => {
    const when = new Date("2026-10-22T12:00:00.000Z");
    for (const patient of PATIENTS) {
      const bundle = buildFhirBundle(patient, when);
      const issues = validateFhirR4Bundle(bundle);
      expect(issues, `${patient.id}: ${issues.map((i) => i.message).join("; ")}`).toEqual([]);
      expect(bundle.timestamp).toBe("2026-10-22T12:00:00.000Z");
      expect(bundle.entry.every((item) => item.fullUrl.startsWith(`${FHIR_BASE}/`))).toBe(true);

      const patientRes = bundle.entry.find((item) => item.resource.resourceType === "Patient")!.resource;
      expect(patientRes.gender).toMatch(/^(male|female|other|unknown)$/);
      expect(patientRes.birthDate).toBeUndefined();

      const vitals = bundle.entry.filter((item) => {
        const resource = item.resource;
        const category = resource.category as { coding?: { code?: string }[] }[] | undefined;
        return resource.resourceType === "Observation" && category?.[0]?.coding?.[0]?.code === "vital-signs";
      });
      // Blood pressure is one panel plus five single-value vitals.
      expect(vitals.length).toBe(6);
      const takenAt = new Date(when.getTime() - patient.vitals.takenMinutesAgo * 60_000).toISOString();
      for (const item of vitals) {
        const code = item.resource.code as { coding?: { system?: string; code?: string }[] };
        expect(code.coding?.[0]?.system).toBe("http://loinc.org");
        expect(code.coding?.[0]?.code).toMatch(/^\d{2,5}-\d$/);
        expect(item.resource.effectiveDateTime).toBe(takenAt);
        const components = item.resource.component as { valueQuantity?: { system?: string; code?: string } }[] | undefined;
        if (components?.length) {
          expect(item.resource.valueQuantity).toBeUndefined();
          for (const part of components) {
            expect(part.valueQuantity?.system).toBe("http://unitsofmeasure.org");
            expect(part.valueQuantity?.code).toBeTruthy();
          }
        } else {
          const qty = item.resource.valueQuantity as { system?: string; code?: string };
          expect(qty.system).toBe("http://unitsofmeasure.org");
          expect(qty.code).toBeTruthy();
        }
      }
    }
  });

  it("codes NKDA with SNOMED 409137002 and keeps the original text", () => {
    const patient = PATIENTS.find((p) => p.allergies.some((a) => /no known/i.test(a)))!;
    const bundle = buildFhirBundle(patient);
    const allergy = bundle.entry.find((item) => item.resource.resourceType === "AllergyIntolerance")!.resource;
    const code = allergy.code as { text?: string; coding?: { system?: string; code?: string }[] };
    expect(code.text).toBe(patient.allergies[0]);
    expect(code.coding?.[0]).toEqual({
      system: "http://snomed.info/sct",
      code: "409137002",
      display: "No known drug allergy (situation)"
    });
    expect(parseFhirBundle(bundle).allergies).toEqual(patient.allergies);
  });

  it("rejects resources that violate R4 collection rules", () => {
    const bundle = buildFhirBundle(PATIENTS[0], new Date("2026-10-22T12:00:00.000Z"));
    const broken = structuredClone(bundle);
    broken.entry[0].fullUrl = "urn:nomi:demo/Patient/P-88472";
    const qty = broken.entry.find((item) => item.resource.valueQuantity)?.resource
      .valueQuantity as { system?: string; code?: string };
    delete qty.code;
    const issues = validateFhirR4Bundle(broken);
    expect(issues.some((i) => /fullUrl/i.test(i.message))).toBe(true);
    expect(issues.some((i) => /UCUM|code SHALL/i.test(i.message))).toBe(true);
    expect(validateFhirR4Bundle(bundle)).toEqual([]);
  });
});
