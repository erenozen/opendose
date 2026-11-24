// Power tool, nested design (FEATURE-PLAN P-96): the closed-form answer
// checked by simulation. The planned experiment is simulated cell by
// cell in chunks (engine handler "nested_power_sim"), with progress and
// Stop; the chunks are pooled by the engine, which reports the power
// with its Monte Carlo SE and Wilson 95% CI.
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Button, Field, Input, NumberField, NumText } from "../components/ui";
import { analyzeAsync, isCancelled } from "../lib/engine";
import { Grid, KV } from "../sheets/common/clinicalKit";
import { formatSig } from "../types";
import { parseSeed, randomSeed, runChunks } from "./chunks";
import { nestedSimOptions, type PowerForm, type PowerResult } from "./power";

const CHUNK = 250;
const MAX = 10000;
const pct = (v: number | null | undefined) => (v == null ? "—" : `${formatSig(100 * v, 4)}%`);

interface Pooled {
  power: number; mc_se: number; ci95: [number | null, number | null]; n_repeats: number;
  power_all?: number; power_any?: number; seed?: number;
}

/** The trade-off of cells against animals, from the closed form. */
export function NestedTradeoff({ r }: { r: PowerResult }) {
  if (!r.tradeoff?.length) return null;
  return (
    <section className="result-card power-tradeoff">
      <h3>Cells or animals?</h3>
      <Grid caption="Animals per group for each number of cells per animal"
        head={["Cells per animal", "Animals per group"]}
        rows={r.tradeoff.map((t) => [String(t.m), String(t.n)])} />
      <p className="hint-block">
        Past a few cells per animal, more cells barely lower the animals needed: the
        between-animal SD sets the floor (Aarts et al. 2014, Nat Neurosci 17:491).
      </p>
    </section>
  );
}

export default function NestedSimCard({ form, result }: { form: PowerForm; result: PowerResult }) {
  const [repeats, setRepeats] = useState("2000");
  const [seedText, setSeedText] = useState("");
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [out, setOut] = useState<Pooled | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ended, setEnded] = useState("");
  const stop = useRef(false);
  useEffect(() => () => { stop.current = true; }, []);
  const options = nestedSimOptions(form, result);
  const key = JSON.stringify(options);
  // A new plan invalidates the last simulation and stops one in flight:
  // its answer would belong to the old inputs.
  const keyRef = useRef(key);
  useEffect(() => {
    keyRef.current = key;
    stop.current = true;
    setOut(null); setEnded(""); setError(null);
  }, [key]);
  const total = Math.round(Number(repeats));
  const seedParsed = parseSeed(seedText);
  const ok = Number.isFinite(total) && total >= 1 && total <= MAX && !("error" in seedParsed) && options !== null;
  const busy = !!progress;
  // Run and Stop take turns in one place: focus moves with them.
  const runBtn = useRef<HTMLButtonElement>(null);
  const stopBtn = useRef<HTMLButtonElement>(null);
  const wasBusy = useRef(false);
  useEffect(() => {
    if (busy === wasBusy.current) return;
    wasBusy.current = busy;
    const from = busy ? runBtn : stopBtn;
    const to = busy ? stopBtn : runBtn;
    if (document.activeElement === from.current || document.activeElement === document.body) to.current?.focus();
  }, [busy]);

  const run = async () => {
    if (!ok || !options) return;
    const runKey = key;
    stop.current = false;
    setError(null);
    setEnded("");
    const seed = ("seed" in seedParsed && seedParsed.seed !== null) ? seedParsed.seed : randomSeed();
    if (!seedText.trim()) setSeedText(String(seed));
    setProgress({ done: 0, total });
    try {
      const res = await runChunks(total, CHUNK, seed, async (n, s) => {
        const r = await analyzeAsync({ analysis: "nested_power_sim", data: {},
          options: { ...options, n_repeats: n, seed: s } }, { priority: "user" }) as Record<string, unknown>;
        if (r.error) throw new Error(String(r.error));
        return r;
      }, (done) => setProgress({ done, total }), () => stop.current);
      if (keyRef.current !== runKey) return;
      if (!res.chunks.length) { setEnded("Stopped."); return; }
      const pooled = await analyzeAsync({ analysis: "nested_power_sim", data: {},
        options: { test: options.test, pool: res.chunks } }, { priority: "user" }) as Pooled & { error?: string };
      if (pooled.error) throw new Error(pooled.error);
      if (keyRef.current !== runKey) return;
      setOut({ ...pooled, seed });
      setEnded(res.cancelled ? `Stopped after ${res.done.toLocaleString()} simulated experiments.`
        : `Finished ${res.done.toLocaleString()} simulated experiments.`);
    } catch (e) {
      if (!isCancelled(e)) setError(`Could not simulate the planned experiment: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setProgress(null);
    }
  };

  const headingId = useId();
  const rows: [string, ReactNode][] = out ? [
    [result.test === "dunnett" ? "Simulated power, per comparison" : "Simulated power", pct(out.power)],
    ["Monte Carlo SE", pct(out.mc_se)],
    ["95% CI (Wilson)", <NumText key="ci" text={`${pct(out.ci95[0])} to ${pct(out.ci95[1])}`} />],
    ...(out.power_all !== undefined ? [["All treated groups detected", pct(out.power_all)] as [string, ReactNode]] : []),
    ...(out.power_any !== undefined ? [["At least one detected", pct(out.power_any)] as [string, ReactNode]] : []),
    ["Closed-form power", pct(result.power)],
    ["Simulated experiments", out.n_repeats.toLocaleString()],
    ["Seed", String(out.seed)],
  ] : [];
  return (
    <section className="result-card power-nested-sim" aria-labelledby={headingId}>
      <h3 id={headingId}>Check by simulation</h3>
      <p className="hint-block">
        Simulates the planned experiment cell by cell (a normal effect per animal, normal noise per
        cell) at {result.n} animals per group and runs the {result.test === "t" ? "t test"
          : result.test === "mann_whitney" ? "Mann-Whitney test" : "Dunnett’s test"} on the animal
        means. The answer carries Monte Carlo error: it is shown as its SE.
      </p>
      <div className="power-sim-inputs">
        <NumberField label="Simulated experiments" integer min={1} max={MAX} value={repeats}
          readOnly={busy} onValueChange={setRepeats} />
        <Field label="Seed" error={"error" in seedParsed ? seedParsed.error : null}>
          <Input inputMode="numeric" autoComplete="off" placeholder="new" value={seedText} readOnly={busy}
            onChange={(e) => setSeedText(e.target.value)} />
        </Field>
      </div>
      <div className="power-run">
        <span className="sr-only" role="status">{busy ? "Simulating…" : ended}</span>
        {busy ? (
          <>
            <progress max={progress.total} value={progress.done} aria-label="Simulation progress" />
            <span className="power-count" aria-hidden="true">{progress.done} of {progress.total}</span>
            <Button ref={stopBtn} onClick={() => { stop.current = true; }}>Stop</Button>
          </>
        ) : (
          <Button ref={runBtn} disabled={!ok} onClick={() => void run()}>
            {out ? "Simulate again" : "Simulate power"}</Button>
        )}
      </div>
      {error && <p className="results-error" role="alert">{error}</p>}
      {out && <KV rows={rows} className="power-kv" />}
    </section>
  );
}
