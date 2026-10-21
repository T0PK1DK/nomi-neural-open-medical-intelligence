import { describe, expect, it } from "vitest";
import { PATIENTS, patientById } from "../src/data/patients";
import {
  FHIR_BASE,
  buildFhirBundle,
  parseFhirBundle,
  type FhirBundle,
  type FhirResource
} from "../src/engine/fhir";

const NOW = new Date("2026-10-21T12:00:00.000Z");
const FHIR_ID = /^[A-Za-z0-9\-.]{1,64}$/;
const UCUM = "http://unitsofmeasure.org";
const LOINC = "http://loinc.org";

const bundles = PATIENTS.map((p) => ({ patient: p, bundle: buildFhirBundle(p, NOW) }));

function resources(bundle: FhirBundle, type?: string): FhirResource[] {
  return bundle.entry.map((e) => e.resource).filter((r) => !type || r.resourceType === type);
}

function byId(bundle: FhirBundle, id: string): Record<string, any> {
  const hit = bundle.entry.find((e) => e.resource.id === id);
  if (!hit) throw new Error(`missing ${id}`);
  return hit.resource as Record<string, any>;
}

/** Every `reference` string anywhere inside a resource. */
function referencesIn(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(referencesIn);
  if (value && typeof value === "object") {
    return Object.entries(value).flatMap(([key, v]) =>
      key === "reference" && typeof v === "string" ? [v] : referencesIn(v)
    );
  }
  return [];
}

/** Every Quantity-shaped object (has a numeric `value` and a `unit`). */
function quantitiesIn(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) return value.flatMap(quantitiesIn);
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const self = typeof record.value === "number" && "unit" in record ? [record] : [];
    return [...self, ...Object.values(record).flatMap(quantitiesIn)];
  }
  return [];
}

describe("FHIR R4 bundle structure", () => {
  it.each(bundles)("uses valid, unique ids and RESTful fullUrls for $patient.id", ({ bundle }) => {
    expect(bundle.id).toMatch(FHIR_ID);
    const fullUrls = new Set<string>();
    for (const { fullUrl, resource } of bundle.entry) {
      expect(resource.id).toMatch(FHIR_ID);
      expect(fullUrl).toBe(`${FHIR_BASE}/${resource.resourceType}/${resource.id}`);
      fullUrls.add(fullUrl);
    }
    expect(fullUrls.size).toBe(bundle.entry.length);
  });

  it.each(bundles)("resolves every reference inside the bundle for $patient.id", ({ bundle }) => {
    const fullUrls = new Set(bundle.entry.map((e) => e.fullUrl));
    const refs = bundle.entry.flatMap((e) => referencesIn(e.resource));
    expect(refs.length).toBeGreaterThan(0);
    for (const ref of refs) {
      // R4 bundle resolution: a relative reference resolves against the referring entry's base.
      expect(fullUrls.has(`${FHIR_BASE}/${ref}`), `${ref} does not resolve`).toBe(true);
    }
  });

  it("scopes Observation ids to the chart so two exports never share an identity", () => {
    const [a, b] = [bundles[0].bundle, bundles[1].bundle];
    const urlsA = new Set(a.entry.map((e) => e.fullUrl));
    expect(b.entry.filter((e) => urlsA.has(e.fullUrl))).toEqual([]);
  });

  it.each(bundles)("never sends a Quantity system without a code for $patient.id", ({ bundle }) => {
    for (const qty of quantitiesIn(bundle.entry)) {
      if ("system" in qty) {
        expect(qty.system).toBe(UCUM);
        expect(typeof qty.code).toBe("string");
      }
    }
  });
});

describe("FHIR R4 vital signs profiles", () => {
  const PROFILES: Record<string, { profile: string; loinc: string; ucum: string }> = {
    "vital-hr": { profile: "heartrate", loinc: "8867-4", ucum: "/min" },
    "vital-rr": { profile: "resprate", loinc: "9279-1", ucum: "/min" },
    "vital-spo2": { profile: "oxygensat", loinc: "2708-6", ucum: "%" },
    "vital-temp": { profile: "bodytemp", loinc: "8310-5", ucum: "Cel" },
    "vital-wt": { profile: "bodyweight", loinc: "29463-7", ucum: "kg" }
  };

  it.each(bundles)("meets the single-value vital profiles for $patient.id", ({ patient, bundle }) => {
    const takenAt = new Date(NOW.getTime() - patient.vitals.takenMinutesAgo * 60_000).toISOString();
    for (const [suffix, spec] of Object.entries(PROFILES)) {
      const obs = byId(bundle, `${patient.id}-${suffix}`);
      expect(obs.meta.profile).toEqual([`http://hl7.org/fhir/StructureDefinition/${spec.profile}`]);
      expect(obs.status).toBe("final");
      expect(obs.category[0].coding[0]).toMatchObject({
        system: "http://terminology.hl7.org/CodeSystem/observation-category",
        code: "vital-signs"
      });
      expect(obs.code.coding).toContainEqual(expect.objectContaining({ system: LOINC, code: spec.loinc }));
      expect(obs.subject).toEqual({ reference: `Patient/${patient.id}` });
      expect(obs.effectiveDateTime).toBe(takenAt);
      expect(obs.valueQuantity).toMatchObject({ system: UCUM, code: spec.ucum });
    }
  });

  it("exports blood pressure as one panel with systolic and diastolic components", () => {
    const patient = patientById("P-88472")!;
    const bundle = buildFhirBundle(patient, NOW);
    const bp = byId(bundle, "P-88472-vital-bp");
    expect(bp.meta.profile).toEqual(["http://hl7.org/fhir/StructureDefinition/bp"]);
    expect(bp.code.coding[0]).toMatchObject({ system: LOINC, code: "85354-9" });
    expect(bp.valueQuantity).toBeUndefined();
    const parts = Object.fromEntries(
      bp.component.map((c: any) => [c.code.coding[0].code, c.valueQuantity])
    );
    expect(parts["8480-6"]).toMatchObject({ value: 128, system: UCUM, code: "mm[Hg]" });
    expect(parts["8462-4"]).toMatchObject({ value: 76, system: UCUM, code: "mm[Hg]" });
    expect(resources(bundle, "Observation").some((r) => /vital-(sbp|dbp)$/.test(r.id))).toBe(false);
  });
});

describe("FHIR R4 laboratory observations", () => {
  it("stamps labs with the draw time and maps chart units to UCUM", () => {
    const patient = patientById("P-88472")!;
    const bundle = buildFhirBundle(patient, NOW);
    const drawnAt = new Date(NOW.getTime() - patient.labsDrawnMinutesAgo * 60_000).toISOString();
    for (const lab of patient.labs) {
      const obs = byId(bundle, `P-88472-lab-${lab.id}`);
      expect(obs.effectiveDateTime).toBe(drawnAt);
      expect(obs.category[0].coding[0].code).toBe("laboratory");
      expect(obs.valueQuantity).toMatchObject({ value: lab.value, unit: lab.unit });
    }
    expect(byId(bundle, "P-88472-lab-wbc").valueQuantity).toMatchObject({ unit: "K/µL", code: "10*3/uL" });
    expect(byId(bundle, "P-88472-lab-bnp").valueQuantity).toMatchObject({ code: "pg/mL" });
  });

  it("keeps an unmapped unit as text instead of inventing a UCUM code", () => {
    const patient = patientById("P-88472")!;
    const odd = { ...patient, labs: [{ ...patient.labs[0], id: "odd", unit: "arb units" }] };
    const obs = byId(buildFhirBundle(odd, NOW), "P-88472-lab-odd");
    expect(obs.valueQuantity).toEqual({ value: patient.labs[0].value, unit: "arb units" });
  });
});

describe("FHIR R4 clinical resources", () => {
  it("codes 'No known drug allergies' as a SNOMED CT situation, not a substance", () => {
    const bundle = buildFhirBundle(patientById("P-88472")!, NOW);
    const [allergy] = resources(bundle, "AllergyIntolerance") as Record<string, any>[];
    expect(allergy.code.coding).toEqual([
      { system: "http://snomed.info/sct", code: "409137002", display: "No known drug allergy (situation)" }
    ]);
    expect(allergy.verificationStatus.coding[0].code).toBe("confirmed");
    expect(allergy.clinicalStatus.coding[0].code).toBe("active");
    expect(allergy.reaction).toBeUndefined();
  });

  it("splits substance and reaction, and round-trips the chart text", () => {
    const patient = patientById("P-77301")!;
    const bundle = buildFhirBundle(patient, NOW);
    const [allergy] = resources(bundle, "AllergyIntolerance") as Record<string, any>[];
    expect(allergy.code).toEqual({ text: "Penicillin" });
    expect(allergy.reaction).toEqual([{ manifestation: [{ text: "rash" }] }]);
    expect(parseFhirBundle(bundle).allergies).toEqual(["Penicillin — rash"]);
  });

  it("files problems on the problem list and emits none for an empty list", () => {
    const withProblems = buildFhirBundle(patientById("P-88472")!, NOW);
    for (const condition of resources(withProblems, "Condition") as Record<string, any>[]) {
      expect(condition.category[0].coding[0].code).toBe("problem-list-item");
      expect(condition.clinicalStatus.coding[0].code).toBe("active");
    }
    const none = buildFhirBundle(patientById("P-10955")!, NOW);
    expect(resources(none, "Condition")).toEqual([]);
    expect(parseFhirBundle(none).problems).toEqual([]);
  });

  it("marks PRN orders as needed and leaves scheduled orders alone", () => {
    const meds = resources(buildFhirBundle(patientById("P-77301")!, NOW), "MedicationRequest") as Record<string, any>[];
    const dosage = (name: string) => meds.find((m) => m.medicationCodeableConcept.text === name)!.dosageInstruction[0];
    expect(dosage("Acetaminophen").asNeededBoolean).toBe(true);
    expect(dosage("Levofloxacin").asNeededBoolean).toBeUndefined();
  });

  it("identifies the patient by MRN without any name", () => {
    const bundle = buildFhirBundle(patientById("P-88472")!, NOW);
    const [patient] = resources(bundle, "Patient") as Record<string, any>[];
    expect(patient.identifier[0]).toMatchObject({ system: `${FHIR_BASE}/sid/mrn`, value: "88472-19" });
    expect(patient.identifier[0].type.coding[0].code).toBe("MR");
    expect(patient.name).toBeUndefined();
  });
});

describe("FHIR import compatibility", () => {
  it("still reads a bundle written by the previous export format", () => {
    const legacy = {
      resourceType: "Bundle",
      id: "bundle-p-1",
      type: "collection",
      entry: [
        {
          fullUrl: "urn:nomi:demo/Patient/P-1",
          resource: {
            resourceType: "Patient",
            id: "P-1",
            identifier: [{ system: "urn:nomi:demo:mrn", value: "1-01" }],
            gender: "female",
            extension: [{ url: "urn:nomi:demo:age-years", valueInteger: 50 }]
          }
        },
        {
          fullUrl: "urn:nomi:demo/Observation/vital-sbp",
          resource: {
            resourceType: "Observation",
            id: "vital-sbp",
            category: [{ coding: [{ code: "vital-signs" }] }],
            code: { text: "Systolic blood pressure" },
            valueQuantity: { value: 120, unit: "mmHg", system: "urn:nomi:demo:unit" }
          }
        },
        {
          fullUrl: "urn:nomi:demo/MedicationRequest/med-1",
          resource: {
            resourceType: "MedicationRequest",
            id: "med-1",
            medicationCodeableConcept: { text: "Sertraline" },
            extension: [
              { url: "urn:nomi:demo:dose", valueString: "50 mg" },
              { url: "urn:nomi:demo:route", valueString: "PO" },
              { url: "urn:nomi:demo:schedule", valueString: "daily" }
            ]
          }
        }
      ]
    };
    const slice = parseFhirBundle(legacy);
    expect(slice).toMatchObject({ patientId: "P-1", mrn: "1-01", gender: "female", ageYears: 50 });
    expect(slice.vitals).toEqual([
      { id: "vital-sbp", name: "Systolic blood pressure", value: 120, unit: "mmHg", category: "vital-signs" }
    ]);
    expect(slice.meds).toEqual([{ name: "Sertraline", dose: "50 mg", route: "PO", schedule: "daily" }]);
  });

  it("rejects malformed JSON with a clear error", () => {
    expect(() => parseFhirBundle("{not json")).toThrow(SyntaxError);
    expect(() => parseFhirBundle({ resourceType: "Bundle", type: "collection" })).toThrow(/entry/);
  });
});
