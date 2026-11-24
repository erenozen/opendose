// The reference datasets the validation page opens as projects (P-127):
// an index of the corpus in ../docs/validation/datasets (manifest.json)
// with each dataset's published reference values and the engine's own
// result for each (../docs/validation/results-engine.json, written by
// engine/tests/corpus/run_corpus.py). The CSV files themselves ship with
// the site as they are (src/share/referenceDatasets.ts imports them).
//
//   node scripts/reference-datasets.mjs           writes src/share/referenceDatasets.json
//   node scripts/reference-datasets.mjs --check   exits 1 when the committed index is stale
//
// Which datasets: those under an open licence that allows shipping them
// in the site (public domain: the NIST Statistical Reference Datasets)
// and whose analysis maps onto one OpenDose results sheet (`plan` below).
// The rest of the corpus stays checked by the engine test suite only.
// src/share/__tests__/referenceDatasets.test.ts runs the check.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const VAL = join(here, "..", "..", "docs", "validation");
export const INDEX_PATH = join(here, "..", "src", "share", "referenceDatasets.json");

/** How a dataset becomes a project, or null when it does not map onto
 *  one results sheet the way its reference was computed. */
function plan(d) {
  const o = d.analysis.options ?? {};
  switch (d.workflow) {
    case "descriptive_statistics":
      return d.table_type === "column" ? { kind: "column_stats" } : null;
    case "one_way_anova":
      return d.table_type === "column" && d.analysis.handler === "anova" ? { kind: "anova" } : null;
    case "nonlinear_regression":
      return o.user_equation?.text && o.start_values?.start1
        ? { kind: "user_fit", equation: o.user_equation.text, start: o.start_values.start1 } : null;
    case "linear_regression":
      return d.analysis.handler === "linear_regression"
        ? { kind: "linreg", throughOrigin: o.model === "line_through_origin" } : null;
    case "polynomial_regression":
      // Up to the second order is a built-in model; NIST Filip's tenth
      // order is beyond the models (and the user-equation fit at that
      // conditioning), so it is not offered.
      return o.model === "polynomial_second" ? { kind: "polynomial2" } : null;
    case "multiple_regression":
      return d.table_type === "multiple_variables" ? { kind: "mv_regression" } : null;
    default:
      return null;
  }
}

const shippable = (d) => /^public domain/i.test(d.licence ?? "");

/** The index text a compilation gives now. */
export function compileIndex() {
  const manifest = JSON.parse(readFileSync(join(VAL, "datasets", "manifest.json"), "utf8"));
  const engine = JSON.parse(readFileSync(join(VAL, "results-engine.json"), "utf8"));
  const ours = new Map(engine.quantities.map((q) => [`${q.dataset}\u0000${q.quantity}`, q]));
  const datasets = [];
  for (const d of manifest.datasets) {
    const p = shippable(d) ? plan(d) : null;
    if (!p) continue;
    datasets.push({
      id: d.id,
      title: d.title,
      file: d.file,
      workflow: d.workflow,
      citation: d.citation,
      sourceUrl: d.source_url,
      licence: d.licence,
      ...(d.difficulty ? { difficulty: d.difficulty } : {}),
      ...(d.stress_test ? { stress: true } : {}),
      layout: d.layout,
      plan: p,
      references: d.reference.map((r) => {
        const q = ours.get(`${d.id}\u0000${r.quantity}`);
        return {
          quantity: r.quantity,
          value: r.value,
          ...(r.printed ? { printed: r.printed } : {}),
          tolerance: r.tolerance ?? null,
          source: r.source,
          ...(q && typeof q.ours === "number"
            ? { engine: { value: q.ours, status: q.status } } : {}),
        };
      }),
    });
  }
  return `${JSON.stringify({
    source: "docs/validation/datasets/manifest.json and docs/validation/results-engine.json "
      + "(node scripts/reference-datasets.mjs)",
    engineRun: engine.engine ?? null,
    datasets,
  }, null, 1)}\n`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const text = compileIndex();
  if (process.argv.includes("--check")) {
    if (readFileSync(INDEX_PATH, "utf8") !== text) {
      console.error("src/share/referenceDatasets.json is out of date: run node scripts/reference-datasets.mjs");
      process.exit(1);
    }
    console.log("reference dataset index up to date");
  } else {
    writeFileSync(INDEX_PATH, text);
    console.log(`wrote ${INDEX_PATH}`);
  }
}
