// The JSON Schema of the project file, generated from the TypeScript
// model (src/project/fileFormat.ts ProjectFile, which is types.ts plus
// the keys only the file has) with ts-json-schema-generator, a build-time
// devDependency: nothing of it reaches the app bundle.
//
//   node scripts/project-schema.mjs           writes ../docs/project-file.schema.json
//   node scripts/project-schema.mjs --check   exits 1 when the committed
//                                             schema differs from a fresh one
//
// src/project/__tests__/schema.test.ts runs the check in the unit suite
// and validates every project fixture against the schema with ajv.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createGenerator } from "ts-json-schema-generator";

const here = dirname(fileURLToPath(import.meta.url));
export const SCHEMA_PATH = join(here, "..", "..", "docs", "project-file.schema.json");
export const SCHEMA_ID = "https://opendose.erenozen.dev/project-file.schema.json";

/** The schema text a generation gives now. */
export function generateSchema() {
  const schema = createGenerator({
    path: join(here, "..", "src", "project", "fileFormat.ts"),
    tsconfig: join(here, "..", "tsconfig.app.json"),
    type: "ProjectFile",
    // Type-check is the build's job (tsc -b); here only the shapes matter.
    skipTypeCheck: true,
    // Keys the model does not name are refused: the schema says exactly
    // what OpenDose writes (open-ended objects such as analysis options
    // are `unknown` in the model and stay open).
    additionalProperties: false,
    expose: "export",
    topRef: true,
    jsDoc: "extended",
    sortProps: true,
    strictTuples: false,
    encodeRefs: true,
  }).createSchema("ProjectFile");
  const out = {
    $schema: schema.$schema,
    $id: SCHEMA_ID,
    title: "OpenDose project file",
    description: "Generated from web/src/project/fileFormat.ts by web/scripts/project-schema.mjs; "
      + "do not edit. The format is described in docs/project-file-format.md.",
    ...Object.fromEntries(Object.entries(schema).filter(([k]) => k !== "$schema")),
  };
  return `${JSON.stringify(out, null, 2)}\n`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const fresh = generateSchema();
  if (process.argv.includes("--check")) {
    let committed = "";
    try { committed = readFileSync(SCHEMA_PATH, "utf8"); } catch { /* missing */ }
    if (committed !== fresh) {
      console.error("docs/project-file.schema.json is out of date: run node scripts/project-schema.mjs");
      process.exit(1);
    }
    console.log("docs/project-file.schema.json matches the model");
  } else {
    writeFileSync(SCHEMA_PATH, fresh);
    console.log(`wrote ${SCHEMA_PATH}`);
  }
}
