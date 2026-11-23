// Validates a project file (parsed JSON) against the published schema,
// docs/project-file.schema.json, with ajv (a devDependency). The e2e
// suites run every project they save through it; the unit suite runs the
// fixtures (src/project/__tests__/schema.test.ts).
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import Ajv from "ajv";

const here = dirname(fileURLToPath(import.meta.url));
const schema = JSON.parse(readFileSync(join(here, "..", "..", "docs", "project-file.schema.json"), "utf8"));
const validate = new Ajv({ allErrors: true }).compile(schema);

/** Where `json` breaks the schema, one line per error ([] = valid). */
export function projectSchemaErrors(json) {
  if (validate(json)) return [];
  return (validate.errors ?? []).map((e) =>
    `${e.instancePath || "/"} ${e.message}${e.params?.additionalProperty ? ` (${e.params.additionalProperty})` : ""}`);
}
