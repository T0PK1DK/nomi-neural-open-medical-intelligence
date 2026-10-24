/**
 * Writes one FHIR R4 Bundle JSON per demo chart into the given directory so the
 * offline HAPI validator (see ./pom.xml) can check them.
 * Usage: npx vite-node scripts/fhir-validate/dump-bundles.ts <outDir>
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { PATIENTS } from "../../src/data/patients";
import { buildFhirBundle, fhirFilename, serializeFhirBundle } from "../../src/engine/fhir";

const outDir = process.argv[2] ?? "scripts/fhir-validate/target/bundles";
mkdirSync(outDir, { recursive: true });
const now = new Date("2026-10-21T12:00:00.000Z");
for (const patient of PATIENTS) {
  const file = join(outDir, fhirFilename(patient.id));
  writeFileSync(file, serializeFhirBundle(buildFhirBundle(patient, now)));
  console.log(`wrote ${file}`);
}
