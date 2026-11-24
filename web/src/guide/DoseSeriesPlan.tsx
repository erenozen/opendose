// "Plan an experiment…", dose-response curves (FEATURE-PLAN P-97): check
// a planned dose series before the experiment. The engine
// (engine/opendose/doseplan.py) gives the expected 95% CI of the IC50
// from the expected information matrix and checks that both plateaus get
// at least two concentrations beyond their bend points (Sebaugh 2011);
// "Check by simulation" fits simulated experiments in chunks, with
// progress and Stop. The slope, plateaus and SD are assumptions, and the
// card says so.
import { useEffect, useId, useRef, useState } from "react";
import { Button, Field, Input, NumberField, NumText } from "../components/ui";
import { analyzeAsync, isCancelled } from "../lib/engine";
import { parseSeed, randomSeed, runChunks } from "../power/chunks";
import { KV } from "../sheets/common/clinicalKit";
import { formatSig } from "../types";
import {
  ciSentence, DILUTIONS, doseOptions, seriesLabel, simRows,
  type DoseForm, type DosePlanResult, type DoseSimPooled,
} from "./doseSeries";
import { SRC } from "./sources";
import "../power/power.css";

const CHUNK = 10;
const MAX_SIM = 2000;

export default function DoseSeriesPlan({ form, setForm, rising, onResult }: {
  form: DoseForm; setForm: (f: DoseForm) => void; rising: boolean;
  onResult?: (r: DosePlanResult | null) => void;
}) {
  const set = (p: Partial<DoseForm>) => setForm({ ...form, ...p });
  const [result, setResult] = useState<DosePlanResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const opts = doseOptions(form, rising);
  const key = JSON.stringify(opts);
  useEffect(() => {
    let live = true;
    const ctl = new AbortController();
    if ("error" in opts) { setResult(null); setError(opts.error); onResult?.(null); return; }
    const t = setTimeout(() => {
      analyzeAsync({ analysis: "dose_plan", data: {}, options: opts.options }, { signal: ctl.signal, priority: "user" })
        .then((r) => {
          if (!live) return;
          const res = r as DosePlanResult;
          if (res.error) { setError(String(res.error)); setResult(null); onResult?.(null); return; }
          setError(null); setResult(res); onResult?.(res);
        }, (e) => { if (live && !isCancelled(e)) setError(e instanceof Error ? e.message : String(e)); });
    }, 200);
    return () => { live = false; clearTimeout(t); ctl.abort(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  const dilutionId = useId();
  const preset = DILUTIONS.some(([v]) => v === form.dilution) ? form.dilution : "custom";
  return (
    <div className="dose-plan">
      <p className="wt-hint">
        Before the experiment: how precisely will this series pin down the IC50, and will both
        plateaus be defined? The slope, plateaus and SD below are assumptions; change them to see
        how sensitive the plan is.
      </p>
      <div className="dose-plan-fields">
        <NumberField label="Expected IC50" min={0} value={form.ic50} onValueChange={(ic50) => set({ ic50 })} />
        <Field label="Unit">
          <Input value={form.unit} autoComplete="off" onChange={(e) => set({ unit: e.target.value })} />
        </Field>
        <NumberField label="Highest concentration" min={0} value={form.topDose} onValueChange={(topDose) => set({ topDose })} />
        <NumberField label="Concentrations" integer min={2} max={48} value={form.nDoses}
          onValueChange={(nDoses) => set({ nDoses })} />
        <Field id={dilutionId} label="Spacing">
          <select id={dilutionId} value={preset}
            onChange={(e) => set({ dilution: e.target.value === "custom" ? "4" : e.target.value })}>
            {DILUTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            <option value="custom">Other factor</option>
          </select>
        </Field>
        {preset === "custom" && (
          <NumberField label="Dilution factor" min={0} value={form.dilution} onValueChange={(dilution) => set({ dilution })} />
        )}
        <NumberField label="Replicates per concentration" integer min={1} max={24} value={form.replicates}
          onValueChange={(replicates) => set({ replicates })} />
        <NumberField label="Hill slope (assumed)" min={0} value={form.hill} onValueChange={(hill) => set({ hill })} />
        <NumberField label="Top plateau (assumed)" value={form.top} onValueChange={(top) => set({ top })} />
        <NumberField label="Bottom plateau (assumed)" value={form.bottom} onValueChange={(bottom) => set({ bottom })} />
        <NumberField label="SD of one well (assumed)" min={0} value={form.sd} onValueChange={(sd) => set({ sd })} />
      </div>
      {error && <p className="results-error" role="alert">{error}</p>}
      {result && <DosePlanAnswer r={result} unit={form.unit} />}
      {result?.estimable && "options" in opts && <DoseSim options={opts.options} result={result} />}
      <p className="wt-sources">
        Sources: <a href={SRC.sebaugh2011.url} target="_blank" rel="noreferrer">{SRC.sebaugh2011.label}</a>;{" "}
        <a href={SRC.sebaughMcCray2003.url} target="_blank" rel="noreferrer">{SRC.sebaughMcCray2003.label}</a>
      </p>
    </div>
  );
}

function DosePlanAnswer({ r, unit }: { r: DosePlanResult; unit: string }) {
  const u = unit.trim() ? `\u00a0${unit.trim()}` : "";
  const fmt = (v: number) => formatSig(v, 3);
  return (
    <div className="dose-plan-answer">
      <p className="dose-plan-series">{seriesLabel(r, unit)}.</p>
      <p className="dose-plan-ci"><strong><NumText text={ciSentence(r, unit)} /></strong></p>
      <ul className="plan-checks" aria-label="Plateau checks">
        {(["top", "bottom"] as const).map((name) => {
          const p = r.plateaus[name];
          return (
            <li key={name} className={p.defined ? "ok" : "bad"} data-check={`${name}-plateau`}>
              <p className="plan-check-title">
                {p.defined ? `The ${name} plateau is defined` : `The ${name} plateau will not be defined`}
              </p>
              <p>
                <NumText text={`${p.doses_beyond_bend} concentration${p.doses_beyond_bend === 1 ? "" : "s"} `
                  + `beyond the bend point at the ${p.end} (${name === (r.hill < 0 ? "top" : "bottom")
                    ? `below ${fmt(r.bend_points.low)}` : `above ${fmt(r.bend_points.high)}`}${u}); `
                  + "at least 2 are needed."} />
              </p>
            </li>
          );
        })}
        {r.flags.filter((f) => !f.id.endsWith("_plateau")).map((f) => (
          <li key={f.id} className="bad" data-check={f.id}><p>{f.text}</p></li>
        ))}
      </ul>
    </div>
  );
}

function DoseSim({ options, result }: { options: Record<string, number>; result: DosePlanResult }) {
  const [n, setN] = useState("100");
  const [seedText, setSeedText] = useState("");
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [out, setOut] = useState<DoseSimPooled | null>(null);
  const [runError, setRunError] = useState<string | null>(null);
  const [ended, setEnded] = useState("");
  const stop = useRef(false);
  useEffect(() => () => { stop.current = true; }, []);
  const key = JSON.stringify(options);
  // New inputs invalidate the last simulation and stop one in flight.
  const keyRef = useRef(key);
  useEffect(() => {
    keyRef.current = key;
    stop.current = true;
    setOut(null); setEnded(""); setRunError(null);
  }, [key]);
  const total = Math.round(Number(n));
  const seedParsed = parseSeed(seedText);
  const ok = Number.isFinite(total) && total >= 1 && total <= MAX_SIM && !("error" in seedParsed);
  const busy = !!progress;
  const headingId = useId();
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
    if (!ok) return;
    const runKey = key;
    stop.current = false;
    setRunError(null);
    setEnded("");
    const seed = ("seed" in seedParsed && seedParsed.seed !== null) ? seedParsed.seed : randomSeed();
    if (!seedText.trim()) setSeedText(String(seed));
    setProgress({ done: 0, total });
    try {
      const res = await runChunks(total, CHUNK, seed, async (size, s) => {
        const r = await analyzeAsync({ analysis: "dose_plan", data: {},
          options: { ...options, n_sim: size, seed: s, plan: false } }, { priority: "user" }) as Record<string, unknown>;
        if (r.error) throw new Error(String(r.error));
        return r.simulation as Record<string, unknown>;
      }, (done) => setProgress({ done, total }), () => stop.current);
      if (keyRef.current !== runKey) return;
      if (!res.chunks.length) { setEnded("Stopped."); return; }
      const pooled = await analyzeAsync({ analysis: "dose_plan", data: {}, options: { pool: res.chunks } },
        { priority: "user" }) as DoseSimPooled & { error?: string };
      if (pooled.error) throw new Error(pooled.error);
      if (keyRef.current !== runKey) return;
      setOut(pooled);
      setEnded(res.cancelled ? `Stopped after ${res.done} simulated experiments.` : `Finished ${res.done} simulated experiments.`);
    } catch (e) {
      if (!isCancelled(e)) setRunError(`Could not simulate the dose series: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setProgress(null);
    }
  };
  return (
    <section className="dose-plan-sim" aria-labelledby={headingId}>
      <h4 id={headingId}>Check by simulation</h4>
      <p className="wt-hint">Simulates the planned wells with the assumed scatter and fits each data set
        with the curve fitter: how wide the fitted CIs come out, and how often they miss.</p>
      <div className="dose-plan-fields">
        <NumberField label="Simulated experiments" integer min={1} max={MAX_SIM} value={n} readOnly={busy}
          onValueChange={setN} />
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
            {out ? "Simulate again" : "Simulate the series"}</Button>
        )}
      </div>
      {runError && <p className="results-error" role="alert">{runError}</p>}
      {out && <KV rows={simRows(out, result.expected_ci?.fold_width ?? null)} className="power-kv" />}
    </section>
  );
}
