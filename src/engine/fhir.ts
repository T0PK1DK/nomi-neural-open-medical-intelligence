import type { Patient } from "../types";

export type FhirResourceType =
  | "Patient"
  | "Condition"
  | "Observation"
  | "MedicationRequest"
  | "AllergyIntolerance";

export interface FhirResource {
  resourceType: FhirResourceType | string;
  id: string;
  [key: string]: unknown;
}

export interface FhirBundleEntry {
  fullUrl: string;
  resource: FhirResource;
}

export interface FhirBundle {
  resourceType: "Bundle";
  id: string;
  type: "collection";
  timestamp: string;
  meta: {
    tag: { system: string; code: string; display: string }[];
  };
  entry: FhirBundleEntry[];
}

export interface FhirObservationSlice {
  id: string;
  name: string;
  value: number;
  unit: string;
  category: "laboratory" | "vital-signs";
}

export interface FhirMedicationSlice {
  name: string;
  dose: string;
  route: string;
  schedule: string;
}

export interface FhirChartSlice {
  patientId: string;
  mrn: string;
  gender: string;
  ageYears?: number;
  problems: string[];
  labs: FhirObservationSlice[];
  vitals: FhirObservationSlice[];
  meds: FhirMedicationSlice[];
  allergies: string[];
}

const DEMO_SYSTEM = "urn:nomi:demo";

function fhirGender(sex: Patient["sex"]): "male" | "female" | "unknown" {
  if (sex === "male" || sex === "female") return sex;
  return "unknown";
}

function entry(resource: FhirResource): FhirBundleEntry {
  return {
    fullUrl: `${DEMO_SYSTEM}/${resource.resourceType}/${resource.id}`,
    resource
  };
}

function slug(value: string, fallback: string): string {
  const cleaned = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
  return cleaned || fallback;
}

function observation(
  id: string,
  name: string,
  value: number,
  unit: string,
  category: "laboratory" | "vital-signs",
  subjectId: string
): FhirResource {
  return {
    resourceType: "Observation",
    id,
    status: "final",
    category: [
      {
        coding: [
          {
            system: "http://terminology.hl7.org/CodeSystem/observation-category",
            code: category
          }
        ]
      }
    ],
    code: {
      coding: [{ system: `${DEMO_SYSTEM}:code`, code: id, display: name }],
      text: name
    },
    subject: { reference: `Patient/${subjectId}` },
    valueQuantity: { value, unit, system: `${DEMO_SYSTEM}:unit` }
  };
}

/**
 * Read-only FHIR R4-shaped collection for a synthetic chart.
 * Identifiers only — no personal names, no live EHR write-back.
 */
export function buildFhirBundle(patient: Patient, now = new Date()): FhirBundle {
  const entries: FhirBundleEntry[] = [];

  entries.push(
    entry({
      resourceType: "Patient",
      id: patient.id,
      identifier: [{ system: `${DEMO_SYSTEM}:mrn`, value: patient.mrn }],
      gender: fhirGender(patient.sex),
      extension: [{ url: `${DEMO_SYSTEM}:age-years`, valueInteger: patient.ageYears }]
    })
  );

  patient.problems.forEach((problem, index) => {
    entries.push(
      entry({
        resourceType: "Condition",
        id: `cond-${patient.id}-${index + 1}`,
        clinicalStatus: {
          coding: [
            {
              system: "http://terminology.hl7.org/CodeSystem/condition-clinical",
              code: "active"
            }
          ]
        },
        verificationStatus: {
          coding: [
            {
              system: "http://terminology.hl7.org/CodeSystem/condition-ver-status",
              code: "provisional"
            }
          ]
        },
        code: { text: problem },
        subject: { reference: `Patient/${patient.id}` }
      })
    );
  });

  for (const lab of patient.labs) {
    entries.push(entry(observation(`lab-${lab.id}`, lab.name, lab.value, lab.unit, "laboratory", patient.id)));
  }

  const vitals: { id: string; name: string; value: number; unit: string }[] = [
    { id: "vital-sbp", name: "Systolic blood pressure", value: patient.vitals.bpSys, unit: "mmHg" },
    { id: "vital-dbp", name: "Diastolic blood pressure", value: patient.vitals.bpDia, unit: "mmHg" },
    { id: "vital-hr", name: "Heart rate", value: patient.vitals.hr, unit: "/min" },
    { id: "vital-rr", name: "Respiratory rate", value: patient.vitals.rr, unit: "/min" },
    { id: "vital-spo2", name: "Oxygen saturation", value: patient.vitals.spo2, unit: "%" },
    { id: "vital-temp", name: "Body temperature", value: patient.vitals.tempC, unit: "Cel" },
    { id: "vital-wt", name: "Body weight", value: patient.vitals.weightKg, unit: "kg" }
  ];
  for (const vital of vitals) {
    entries.push(entry(observation(vital.id, vital.name, vital.value, vital.unit, "vital-signs", patient.id)));
  }

  patient.meds.forEach((med, index) => {
    entries.push(
      entry({
        resourceType: "MedicationRequest",
        id: `med-${patient.id}-${index + 1}`,
        status: "active",
        intent: "order",
        medicationCodeableConcept: { text: med.name },
        subject: { reference: `Patient/${patient.id}` },
        dosageInstruction: [
          {
            text: `${med.dose} ${med.route} ${med.schedule}`,
            route: { text: med.route },
            timing: { code: { text: med.schedule } }
          }
        ],
        extension: [
          { url: `${DEMO_SYSTEM}:dose`, valueString: med.dose },
          { url: `${DEMO_SYSTEM}:route`, valueString: med.route },
          { url: `${DEMO_SYSTEM}:schedule`, valueString: med.schedule }
        ]
      })
    );
  });

  patient.allergies.forEach((allergy, index) => {
    entries.push(
      entry({
        resourceType: "AllergyIntolerance",
        id: `alg-${patient.id}-${index + 1}`,
        clinicalStatus: {
          coding: [
            {
              system: "http://terminology.hl7.org/CodeSystem/allergyintolerance-clinical",
              code: "active"
            }
          ]
        },
        code: { text: allergy },
        patient: { reference: `Patient/${patient.id}` }
      })
    );
  });

  return {
    resourceType: "Bundle",
    id: `bundle-${slug(patient.id, "chart")}`,
    type: "collection",
    timestamp: now.toISOString(),
    meta: {
      tag: [
        {
          system: DEMO_SYSTEM,
          code: "synthetic",
          display: "Synthetic demonstration chart — not a medical record"
        }
      ]
    },
    entry: entries
  };
}

export function serializeFhirBundle(bundle: FhirBundle): string {
  return `${JSON.stringify(bundle, null, 2)}\n`;
}

export function fhirFilename(patientId: string): string {
  return `${slug(patientId, "chart")}-fhir-bundle.json`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function textOf(value: unknown): string {
  if (typeof value === "string") return value;
  if (!isRecord(value)) return "";
  if (typeof value.text === "string") return value.text;
  const coding = value.coding;
  if (Array.isArray(coding) && isRecord(coding[0]) && typeof coding[0].display === "string") {
    return coding[0].display;
  }
  return "";
}

function quantityOf(resource: Record<string, unknown>): { value: number; unit: string } | null {
  const qty = resource.valueQuantity;
  if (!isRecord(qty) || typeof qty.value !== "number") return null;
  return { value: qty.value, unit: typeof qty.unit === "string" ? qty.unit : "" };
}

function categoryOf(resource: Record<string, unknown>): "laboratory" | "vital-signs" {
  const category = resource.category;
  if (Array.isArray(category)) {
    for (const item of category) {
      const code = isRecord(item) && Array.isArray(item.coding) && isRecord(item.coding[0]) ? item.coding[0].code : "";
      if (code === "vital-signs") return "vital-signs";
      if (code === "laboratory") return "laboratory";
    }
  }
  return "laboratory";
}

/**
 * Parse a bundle produced by `buildFhirBundle` (or an equivalent collection)
 * back into a chart slice. Rejects non-Bundle JSON.
 */
export function parseFhirBundle(input: unknown): FhirChartSlice {
  const raw = typeof input === "string" ? JSON.parse(input) : input;
  if (!isRecord(raw) || raw.resourceType !== "Bundle") {
    throw new Error("Not a FHIR Bundle");
  }
  if (raw.type !== "collection") {
    throw new Error("Bundle type must be collection");
  }
  if (!Array.isArray(raw.entry)) {
    throw new Error("Bundle is missing entry[]");
  }

  const resources = raw.entry
    .map((item) => (isRecord(item) ? item.resource : null))
    .filter(isRecord);

  const patient = resources.find((r) => r.resourceType === "Patient");
  if (!patient || typeof patient.id !== "string") {
    throw new Error("Bundle is missing Patient");
  }

  const identifiers = Array.isArray(patient.identifier) ? patient.identifier : [];
  const mrnEntry = identifiers.find((item) => isRecord(item) && typeof item.value === "string");
  const extensions = Array.isArray(patient.extension) ? patient.extension : [];
  const ageExt = extensions.find(
    (item) => isRecord(item) && typeof item.valueInteger === "number"
  );

  const problems = resources
    .filter((r) => r.resourceType === "Condition")
    .map((r) => textOf(r.code))
    .filter(Boolean);

  const observations = resources
    .filter((r) => r.resourceType === "Observation")
    .map((r) => {
      const qty = quantityOf(r);
      if (!qty || typeof r.id !== "string") return null;
      return {
        id: r.id,
        name: textOf(r.code) || r.id,
        value: qty.value,
        unit: qty.unit,
        category: categoryOf(r)
      } satisfies FhirObservationSlice;
    })
    .filter((item): item is FhirObservationSlice => item !== null);

  const meds = resources
    .filter((r) => r.resourceType === "MedicationRequest")
    .map((r) => {
      const extensions = Array.isArray(r.extension) ? r.extension.filter(isRecord) : [];
      const ext = (suffix: string) => {
        const hit = extensions.find((item) => item.url === `${DEMO_SYSTEM}:${suffix}`);
        return hit && typeof hit.valueString === "string" ? hit.valueString : "";
      };
      const dosage = Array.isArray(r.dosageInstruction) && isRecord(r.dosageInstruction[0])
        ? r.dosageInstruction[0]
        : undefined;
      return {
        name: textOf(r.medicationCodeableConcept) || "unknown",
        dose: ext("dose"),
        route: ext("route") || (dosage ? textOf(dosage.route) : ""),
        schedule: ext("schedule") || (dosage && isRecord(dosage.timing) ? textOf(dosage.timing.code) : "")
      } satisfies FhirMedicationSlice;
    });

  const allergies = resources
    .filter((r) => r.resourceType === "AllergyIntolerance")
    .map((r) => textOf(r.code))
    .filter(Boolean);

  return {
    patientId: patient.id,
    mrn: isRecord(mrnEntry) && typeof mrnEntry.value === "string" ? mrnEntry.value : "",
    gender: typeof patient.gender === "string" ? patient.gender : "unknown",
    ageYears: isRecord(ageExt) && typeof ageExt.valueInteger === "number" ? ageExt.valueInteger : undefined,
    problems,
    labs: observations.filter((o) => o.category === "laboratory"),
    vitals: observations.filter((o) => o.category === "vital-signs"),
    meds,
    allergies
  };
}

export function bundleResourceCounts(bundle: FhirBundle): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const item of bundle.entry) {
    const kind = item.resource.resourceType;
    counts[kind] = (counts[kind] ?? 0) + 1;
  }
  return counts;
}
