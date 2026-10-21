import type { Patient } from "../types";

export type FhirResourceType =
  | "Patient"
  | "Condition"
  | "Observation"
  | "MedicationRequest"
  | "AllergyIntolerance";

export interface FhirResource {
  resourceType: FhirResourceType;
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

/**
 * RESTful base for fullUrl. R4 resolves a relative reference such as
 * `Patient/P-88472` against the base of the referring entry's fullUrl, so the
 * fullUrl must be `[base]/[type]/[id]` for references to resolve inside the
 * Bundle. `.example` is reserved (RFC 2606), so it can never collide with a
 * real FHIR server.
 */
export const FHIR_BASE = "https://nomi.example/fhir";

const NOMI_SD = `${FHIR_BASE}/StructureDefinition`;
const NOMI_LAB_CODES = `${FHIR_BASE}/CodeSystem/demo-lab`;
const NOMI_MRN = `${FHIR_BASE}/sid/mrn`;
/** Namespace used by bundles exported before this format; still accepted on import. */
const LEGACY_NS = "urn:nomi:demo";

const LOINC = "http://loinc.org";
const UCUM = "http://unitsofmeasure.org";
const SNOMED = "http://snomed.info/sct";
const OBS_CATEGORY = "http://terminology.hl7.org/CodeSystem/observation-category";
const HL7_SD = "http://hl7.org/fhir/StructureDefinition";

/** Chart units mapped to UCUM codes. Units missing here are exported as text only. */
const UCUM_CODES: Record<string, string> = {
  "pg/mL": "pg/mL",
  "ng/mL": "ng/mL",
  "mg/dL": "mg/dL",
  "mg/L": "mg/L",
  "mmol/L": "mmol/L",
  "mL/min": "mL/min",
  "K/µL": "10*3/uL",
  mmHg: "mm[Hg]",
  "/min": "/min",
  "%": "%",
  Cel: "Cel",
  kg: "kg"
};

/** "No known drug allergies" is an assertion, coded as a SNOMED CT situation rather than a substance. */
const NKDA_PATTERN = /^no known (drug )?allergies$/i;
const NKDA_CODE = { system: SNOMED, code: "409137002", display: "No known drug allergy (situation)" };

/** Separator between substance and reaction in chart allergy strings ("Penicillin — rash"). */
const REACTION_SEPARATOR = " — ";

interface VitalSpec {
  key: string;
  profile: string;
  codings: { system: string; code: string; display: string }[];
  text: string;
  unit: string;
  value: (patient: Patient) => number;
}

/** R4 vital signs profiles (http://hl7.org/fhir/R4/observation-vitalsigns.html). */
const VITALS: VitalSpec[] = [
  {
    key: "hr",
    profile: "heartrate",
    codings: [{ system: LOINC, code: "8867-4", display: "Heart rate" }],
    text: "Heart rate",
    unit: "/min",
    value: (p) => p.vitals.hr
  },
  {
    key: "rr",
    profile: "resprate",
    codings: [{ system: LOINC, code: "9279-1", display: "Respiratory rate" }],
    text: "Respiratory rate",
    unit: "/min",
    value: (p) => p.vitals.rr
  },
  {
    key: "spo2",
    profile: "oxygensat",
    codings: [{ system: LOINC, code: "2708-6", display: "Oxygen saturation in Arterial blood" }],
    text: "Oxygen saturation",
    unit: "%",
    value: (p) => p.vitals.spo2
  },
  {
    key: "temp",
    profile: "bodytemp",
    codings: [{ system: LOINC, code: "8310-5", display: "Body temperature" }],
    text: "Body temperature",
    unit: "Cel",
    value: (p) => p.vitals.tempC
  },
  {
    key: "wt",
    profile: "bodyweight",
    codings: [{ system: LOINC, code: "29463-7", display: "Body weight" }],
    text: "Body weight",
    unit: "kg",
    value: (p) => p.vitals.weightKg
  }
];

function fhirGender(sex: Patient["sex"]): "male" | "female" | "unknown" {
  if (sex === "male" || sex === "female") return sex;
  return "unknown";
}

function entry(resource: FhirResource): FhirBundleEntry {
  return {
    fullUrl: `${FHIR_BASE}/${resource.resourceType}/${resource.id}`,
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

function quantity(value: number, unit: string): Record<string, unknown> {
  const code = UCUM_CODES[unit];
  return code ? { value, unit, system: UCUM, code } : { value, unit };
}

function minutesBefore(now: Date, minutes: number): string {
  return new Date(now.getTime() - minutes * 60_000).toISOString();
}

function vitalCategory() {
  return [{ coding: [{ system: OBS_CATEGORY, code: "vital-signs", display: "Vital Signs" }] }];
}

/**
 * Read-only FHIR R4 collection for a synthetic chart.
 * Identifiers only — no personal names, no live EHR write-back.
 */
export function buildFhirBundle(patient: Patient, now = new Date()): FhirBundle {
  const entries: FhirBundleEntry[] = [];
  const subject = { reference: `Patient/${patient.id}` };
  const vitalsAt = minutesBefore(now, patient.vitals.takenMinutesAgo);
  const labsAt = minutesBefore(now, patient.labsDrawnMinutesAgo);

  entries.push(
    entry({
      resourceType: "Patient",
      id: patient.id,
      identifier: [
        {
          type: { coding: [{ system: "http://terminology.hl7.org/CodeSystem/v2-0203", code: "MR" }] },
          system: NOMI_MRN,
          value: patient.mrn
        }
      ],
      gender: fhirGender(patient.sex),
      extension: [{ url: `${NOMI_SD}/age-years`, valueInteger: patient.ageYears }]
    })
  );

  patient.problems.forEach((problem, index) => {
    entries.push(
      entry({
        resourceType: "Condition",
        id: `cond-${patient.id}-${index + 1}`,
        clinicalStatus: {
          coding: [{ system: "http://terminology.hl7.org/CodeSystem/condition-clinical", code: "active" }]
        },
        verificationStatus: {
          coding: [{ system: "http://terminology.hl7.org/CodeSystem/condition-ver-status", code: "provisional" }]
        },
        category: [
          {
            coding: [
              { system: "http://terminology.hl7.org/CodeSystem/condition-category", code: "problem-list-item" }
            ]
          }
        ],
        code: { text: problem },
        subject
      })
    );
  });

  for (const lab of patient.labs) {
    entries.push(
      entry({
        resourceType: "Observation",
        id: `${patient.id}-lab-${lab.id}`,
        status: "final",
        category: [{ coding: [{ system: OBS_CATEGORY, code: "laboratory", display: "Laboratory" }] }],
        code: {
          coding: [{ system: NOMI_LAB_CODES, code: lab.id, display: lab.name }],
          text: lab.name
        },
        subject,
        effectiveDateTime: labsAt,
        valueQuantity: quantity(lab.value, lab.unit)
      })
    );
  }

  entries.push(
    entry({
      resourceType: "Observation",
      id: `${patient.id}-vital-bp`,
      meta: { profile: [`${HL7_SD}/bp`] },
      status: "final",
      category: vitalCategory(),
      code: {
        coding: [{ system: LOINC, code: "85354-9", display: "Blood pressure panel with all children optional" }],
        text: "Blood pressure"
      },
      subject,
      effectiveDateTime: vitalsAt,
      component: [
        {
          code: {
            coding: [{ system: LOINC, code: "8480-6", display: "Systolic blood pressure" }],
            text: "Systolic blood pressure"
          },
          valueQuantity: quantity(patient.vitals.bpSys, "mmHg")
        },
        {
          code: {
            coding: [{ system: LOINC, code: "8462-4", display: "Diastolic blood pressure" }],
            text: "Diastolic blood pressure"
          },
          valueQuantity: quantity(patient.vitals.bpDia, "mmHg")
        }
      ]
    })
  );

  for (const vital of VITALS) {
    entries.push(
      entry({
        resourceType: "Observation",
        id: `${patient.id}-vital-${vital.key}`,
        meta: { profile: [`${HL7_SD}/${vital.profile}`] },
        status: "final",
        category: vitalCategory(),
        code: { coding: vital.codings, text: vital.text },
        subject,
        effectiveDateTime: vitalsAt,
        valueQuantity: quantity(vital.value(patient), vital.unit)
      })
    );
  }

  patient.meds.forEach((med, index) => {
    const prn = /\bPRN\b/i.test(med.schedule);
    entries.push(
      entry({
        resourceType: "MedicationRequest",
        id: `med-${patient.id}-${index + 1}`,
        status: "active",
        intent: "order",
        medicationCodeableConcept: { text: med.name },
        subject,
        dosageInstruction: [
          {
            text: `${med.dose} ${med.route} ${med.schedule}`,
            ...(prn ? { asNeededBoolean: true } : {}),
            route: { text: med.route },
            timing: { code: { text: med.schedule } }
          }
        ],
        extension: [
          { url: `${NOMI_SD}/dose`, valueString: med.dose },
          { url: `${NOMI_SD}/route`, valueString: med.route },
          { url: `${NOMI_SD}/schedule`, valueString: med.schedule }
        ]
      })
    );
  });

  patient.allergies.forEach((allergy, index) => {
    const nkda = NKDA_PATTERN.test(allergy.trim());
    const [substance, reaction] = nkda ? [allergy, undefined] : allergy.split(REACTION_SEPARATOR, 2);
    entries.push(
      entry({
        resourceType: "AllergyIntolerance",
        id: `alg-${patient.id}-${index + 1}`,
        clinicalStatus: {
          coding: [
            { system: "http://terminology.hl7.org/CodeSystem/allergyintolerance-clinical", code: "active" }
          ]
        },
        ...(nkda
          ? {
              verificationStatus: {
                coding: [
                  {
                    system: "http://terminology.hl7.org/CodeSystem/allergyintolerance-verification",
                    code: "confirmed"
                  }
                ]
              },
              code: { coding: [NKDA_CODE], text: allergy }
            }
          : { code: { text: substance } }),
        patient: subject,
        ...(reaction ? { reaction: [{ manifestation: [{ text: reaction }] }] } : {})
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
          system: `${FHIR_BASE}/CodeSystem/data-origin`,
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

function quantityOf(holder: Record<string, unknown>): { value: number; unit: string } | null {
  const qty = holder.valueQuantity;
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

/** One slice per value: the Observation's own value, or one per component (e.g. a blood pressure panel). */
function observationSlices(resource: Record<string, unknown>): FhirObservationSlice[] {
  if (typeof resource.id !== "string") return [];
  const id = resource.id;
  const category = categoryOf(resource);
  const own = quantityOf(resource);
  if (own) {
    return [{ id, name: textOf(resource.code) || id, value: own.value, unit: own.unit, category }];
  }
  const components = Array.isArray(resource.component) ? resource.component.filter(isRecord) : [];
  return components.flatMap((component) => {
    const qty = quantityOf(component);
    if (!qty) return [];
    const name = textOf(component.code);
    return [{ id: `${id}-${slug(name, "component")}`, name: name || id, value: qty.value, unit: qty.unit, category }];
  });
}

function extensionString(extensions: Record<string, unknown>[], name: string): string {
  const urls = [`${NOMI_SD}/${name}`, `${LEGACY_NS}:${name}`];
  const hit = extensions.find((item) => typeof item.url === "string" && urls.includes(item.url));
  return hit && typeof hit.valueString === "string" ? hit.valueString : "";
}

/**
 * Parse a bundle produced by `buildFhirBundle` (or an equivalent collection)
 * back into a chart slice. Also reads bundles exported by earlier versions.
 * Rejects non-Bundle JSON.
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
    .flatMap(observationSlices);

  const meds = resources
    .filter((r) => r.resourceType === "MedicationRequest")
    .map((r) => {
      const medExtensions = Array.isArray(r.extension) ? r.extension.filter(isRecord) : [];
      const dosage = Array.isArray(r.dosageInstruction) && isRecord(r.dosageInstruction[0])
        ? r.dosageInstruction[0]
        : undefined;
      return {
        name: textOf(r.medicationCodeableConcept) || "unknown",
        dose: extensionString(medExtensions, "dose"),
        route: extensionString(medExtensions, "route") || (dosage ? textOf(dosage.route) : ""),
        schedule:
          extensionString(medExtensions, "schedule") ||
          (dosage && isRecord(dosage.timing) ? textOf(dosage.timing.code) : "")
      } satisfies FhirMedicationSlice;
    });

  const allergies = resources
    .filter((r) => r.resourceType === "AllergyIntolerance")
    .map((r) => {
      const substance = textOf(r.code);
      const reaction = Array.isArray(r.reaction) && isRecord(r.reaction[0]) ? r.reaction[0] : undefined;
      const manifestation =
        reaction && Array.isArray(reaction.manifestation) ? textOf(reaction.manifestation[0]) : "";
      return manifestation ? `${substance}${REACTION_SEPARATOR}${manifestation}` : substance;
    })
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
