// Records the engine's results on the assay cases of analysedCases.ts:
// each case's run is driven with an `analyze` that runs the payload
// through the Python engine natively (opendose.api.analyze_json), the
// same code Pyodide runs in the browser. The unit test replays them.
// Run from web/ after an engine or model change (PYTHON overrides the
// interpreter, which needs numpy and scipy):
//   node src/sheets/assays/__tests__/analysedFixtures.gen.ts
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { analysedCases, FIXTURE_FILE, type RecordedCase } from "./analysedCases.ts";

const python = process.env.PYTHON ?? "/home/eren/opendose/.venv/bin/python";
const engine = new URL("../../../../../engine", import.meta.url).pathname;
const script = "import sys\nfrom opendose.api import analyze_json\nsys.stdout.write(analyze_json(sys.stdin.read()))";

const out: Record<string, RecordedCase> = {};
for (const c of analysedCases()) {
  const rec: RecordedCase = { payloads: [], results: [] };
  c.run((payload) => {
    const text = execFileSync(python, ["-c", script], {
      input: JSON.stringify(payload), env: { ...process.env, PYTHONPATH: engine }, maxBuffer: 1 << 28,
    }).toString();
    const result = JSON.parse(text);
    rec.payloads.push(payload);
    rec.results.push(result);
    return result;
  });
  out[c.key] = rec;
  console.log(c.key, rec.results.map((r) => (r?.error ? `error: ${r.error}` : "ok")).join(", "));
}
writeFileSync(new URL(FIXTURE_FILE, import.meta.url), `${JSON.stringify(out)}\n`);
