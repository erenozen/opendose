// Records the engine's results on the cases of assayMeaningCases.ts: each
// case's run is driven with an `analyze` that runs the payload through the
// Python engine natively (opendose.api.analyze_json), the same code
// Pyodide runs in the browser. meaningAssays.test.ts replays them. Run
// from web/ after an engine or model change (PYTHON overrides the
// interpreter, which needs numpy and scipy):
//   node src/report/__tests__/assayMeaning.gen.ts
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { meaningCases, MEANING_FIXTURE_FILE } from "./assayMeaningCases.ts";

const python = process.env.PYTHON ?? "/home/eren/opendose/.venv/bin/python";
const engine = new URL("../../../../engine", import.meta.url).pathname;
const script = "import sys\nfrom opendose.api import analyze_json\nsys.stdout.write(analyze_json(sys.stdin.read()))";

const out: Record<string, { payloads: unknown[]; results: unknown[] }> = {};
for (const c of meaningCases()) {
  const rec = { payloads: [] as unknown[], results: [] as unknown[] };
  c.run((payload) => {
    const text = execFileSync(python, ["-c", script], {
      input: JSON.stringify(payload), env: { ...process.env, PYTHONPATH: engine }, maxBuffer: 1 << 28,
    }).toString();
    const result = JSON.parse(text);
    rec.payloads.push(JSON.parse(JSON.stringify(payload)));
    rec.results.push(result);
    return result;
  });
  out[c.key] = rec;
  console.log(c.key, rec.results.map((r) => ((r as { error?: string })?.error ? `error: ${(r as { error: string }).error}` : "ok")).join(", "));
}
writeFileSync(new URL(MEANING_FIXTURE_FILE, import.meta.url), `${JSON.stringify(out)}\n`);
