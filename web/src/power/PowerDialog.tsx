// Tools → Power and sample size: a priori (n), post hoc (power) and
// sensitivity (detectable effect) calculations for t, F, proportion,
// correlation, chi-square and log-rank tests, with effect-size helpers,
// power curves and the ARRIVE-style justification sentence (saved to the
// project as an info sheet); and a randomisation list generator.
import { useEffect, useMemo, useState } from "react";
import type Plotly from "plotly.js-dist-min";
import { useProject } from "../app/context";
import { useUi } from "../app/ui";
import Modal from "../components/Modal";
import { saveBlob } from "../export/download";
import { analyzeAsync, isCancelled } from "../lib/engine";
import { DEFAULT_SCHEME, seriesStyle } from "../lib/palette";
import { newId } from "../project/ids";
import { addSheets, makeInfoSheet, uniqueName } from "../project/ops";
import { formatSig } from "../types";
import { Field, Grid, KV, Select, TextNum } from "../sheets/common/clinicalKit";
import { baseLayout, chromeFor, useDark } from "../sheets/multivariable/chart";
import { PlotlyChart } from "../sheets/multivariable/plotkit";
import {
  defaultForm, defaultRandomForm, dFromMeans, effectGrid, FAMILIES, fFromMeans,
  hFromProportions, hrFromMedians, justificationSheetContent, KIND_LABELS, HAS_TAILS, nForCurve,
  nGrid, nLabel, powerOptions, powerPayload, randomCsv, randomOptions, rawDetectable, unroundedN,
  type PowerForm,
  type PowerKind, type PowerResult, type RandomForm, type RandomResult,
} from "./power";
import "./power.css";

type Tab = "power" | "random";
type Curve = { x: number[]; y: number[] };

const f = (v: number | null | undefined, sig?: number) => formatSig(v ?? null, sig);
const pct = (v: number) => `${formatSig(100 * v, 4)}%`;
const n = (s: string) => {
  const v = Number(String(s).trim().replace(",", "."));
  return String(s).trim() !== "" && Number.isFinite(v) ? v : null;
};

const EFFECT_LABEL: Record<PowerKind, string> = {
  t_two_sample: "Cohen's d", t_paired: "d_z (mean difference ÷ SD of differences)",
  t_one_sample: "Cohen's d", anova_oneway: "Cohen's f", two_proportions: "Proportion 2",
  one_proportion: "Expected proportion", mcnemar: "Odds ratio (discordant pairs)",
  correlation: "ρ", logrank: "Hazard ratio (treated vs control)", chi_square: "Cohen's w",
};

export default function PowerDialog({ initial, onClose }: { initial: Tab; onClose: () => void }) {
  const [tab, setTab] = useState<Tab>(initial);
  return (
    <Modal title={tab === "power" ? "Power and sample size" : "Randomisation list"}
      className="modal-wide power-dialog" onClose={onClose}
      actions={<button type="button" className="btn-primary" onClick={onClose}>Done</button>}>
      <div className="mv-seg power-tabs" role="tablist" aria-label="Tool">
        <button type="button" role="tab" aria-selected={tab === "power"} className={tab === "power" ? "active" : ""}
          onClick={() => setTab("power")}>Power and sample size</button>
        <button type="button" role="tab" aria-selected={tab === "random"} className={tab === "random" ? "active" : ""}
          onClick={() => setTab("random")}>Randomisation list</button>
      </div>
      {tab === "power" ? <PowerTool /> : <RandomTool />}
    </Modal>
  );
}

/* ------------------------------------------------------------ power */

function PowerTool() {
  const { apply, select, readOnly } = useProject();
  const ui = useUi();
  const [form, setForm] = useState<PowerForm>(defaultForm);
  const [result, setResult] = useState<PowerResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [curves, setCurves] = useState<{ n: Curve; e: Curve; nLabel: string } | null>(null);
  const set = (p: Partial<PowerForm>) => setForm((x) => ({ ...x, ...p }));

  // Recalculate as the inputs change (debounced, in the engine worker; a
  // newer input cancels what is still pending for the older one).
  useEffect(() => {
    let live = true;
    const ctl = new AbortController();
    const t = setTimeout(async () => {
      const p = powerPayload(form);
      if ("error" in p) { setError(p.error); setResult(null); setCurves(null); return; }
      try {
        const r = await analyzeAsync(p.payload, { signal: ctl.signal, priority: "user" }) as PowerResult;
        if (!live) return;
        if (r.error) { setError(String(r.error)); setResult(null); setCurves(null); return; }
        setError(null);
        setResult(r);
        // Power curves: vs sample size at this effect, vs effect at this n.
        const center = nForCurve(r);
        const effect = r.effect.value;
        const slow = form.kind === "two_proportions" && form.propMethod === "fisher_exact";
        const curve = async (xs: number[], over: (v: number) => { n?: number; effect?: number }) => {
          const ys = await Promise.all(xs.map(async (v) => {
            const ov = over(v);
            const o = powerOptions(form, { solve: "power", ...ov, ...(ov.effect === undefined ? { effect } : {}),
              ...(ov.n === undefined ? { n: center } : {}) });
            if ("error" in o) return null;
            const res = await analyzeAsync({ analysis: "power", data: {}, options: o.options },
              { signal: ctl.signal }) as PowerResult;
            return res.error ? null : res.power;
          }));
          const c: Curve = { x: [], y: [] };
          xs.forEach((v, i) => { const pw = ys[i]; if (pw !== null && pw !== undefined) { c.x.push(v); c.y.push(pw); } });
          return c;
        };
        const ns = nGrid(center).filter((v) => !slow || v <= 400);
        const es = effectGrid(form.kind, effect, { p1: n(form.p1) ?? undefined, p0: n(form.p0) ?? undefined,
          rho0: n(form.rho0) ?? undefined });
        const [nc, ec] = await Promise.all([curve(ns, (v) => ({ n: v })),
          slow ? Promise.resolve({ x: [], y: [] }) : curve(es, (v) => ({ effect: v }))]);
        if (live) setCurves({ n: nc, e: ec, nLabel: nLabel(form) });
      } catch (e) {
        if (live && !isCancelled(e)) { setError(e instanceof Error ? e.message : String(e)); setCurves(null); }
      }
    }, 250);
    return () => { live = false; ctl.abort(); clearTimeout(t); };
  }, [form]);

  const save = () => {
    if (!result?.justification) return;
    const content = justificationSheetContent(form, result);
    const id = newId();
    apply((p) => {
      const sheet = { ...makeInfoSheet(id, uniqueName(p, "Sample size justification")),
        notes: content.notes, constants: content.constants };
      return addSheets(p, [sheet]);
    });
    select(id);
    ui.notify("Saved as the info sheet “Sample size justification”.");
  };

  const k = form.kind;
  const solvingEffect = form.solve === "effect";
  const two = k === "t_two_sample" || k === "two_proportions" || k === "logrank";
  return (
    <div className="power-grid">
      <div className="controls power-inputs">
        <section>
          <h3>Test</h3>
          <Field label="Test family and kind">
            <select aria-label="Test" value={k} onChange={(e) => set({ kind: e.target.value as PowerKind })}>
              {FAMILIES.map((fam) => (
                <optgroup key={fam.label} label={fam.label}>
                  {fam.kinds.map((x) => <option key={x} value={x}>{KIND_LABELS[x]}</option>)}
                </optgroup>
              ))}
            </select>
          </Field>
          <Select label="Solve for" value={form.solve}
            options={[["n", "Sample size (a priori)"], ["power", "Power (post hoc)"],
              ["effect", "Detectable effect (sensitivity)"]]}
            onChange={(solve) => set({ solve })} />
          <TextNum label="α (significance level)" value={form.alpha} onChange={(alpha) => set({ alpha })} />
          {HAS_TAILS[k] && (
            <Select label="Tails" value={form.tails}
              options={[["2", "Two-sided"], ["1", "One-sided"]]} onChange={(tails) => set({ tails })} />
          )}
          {form.solve !== "power" && (
            <TextNum label="Power (1 − β)" value={form.power} onChange={(power) => set({ power })} />
          )}
          {form.solve !== "n" && (
            <TextNum label={nLabel(form)} value={form.n} onChange={(v) => set({ n: v })} />
          )}
          {two && (
            <TextNum label="Allocation ratio n2 / n1" value={form.ratio} onChange={(ratio) => set({ ratio })} />
          )}
        </section>
        <section>
          <h3>Effect</h3>
          <EffectInputs form={form} set={set} solvingEffect={solvingEffect} />
        </section>
        <section>
          <h3>Justification</h3>
          <TextNum label="Unit" value={form.unit} onChange={(unit) => set({ unit })}
            note="What n counts: animals, mice, patients, wells…" />
          <TextNum label="Expected attrition (%)" value={form.attrition} placeholder="0"
            onChange={(attrition) => set({ attrition })} />
          <Field label="Effect size based on">
            <input className="constraint-value power-wide" aria-label="Effect size based on" value={form.effectSource} placeholder="e.g. a pilot study (ref.)"
              onChange={(e) => set({ effectSource: e.target.value })} />
          </Field>
        </section>
      </div>
      <div className="power-output" aria-live="polite">
        {error && <div className="results-error" role="alert">{error}</div>}
        {result && <PowerSummary r={result} form={form} />}
        {result?.justification && (
          <div className="result-card power-just">
            <h3>Sample-size justification</h3>
            <p className="power-sentence">{result.justification.text}</p>
            <div className="inline-actions">
              <button type="button" onClick={() => {
                void navigator.clipboard?.writeText(result.justification!.text);
                ui.notify("Justification copied.");
              }}>Copy</button>
              <button type="button" className="btn-primary" disabled={readOnly} onClick={save}>
                Save to project
              </button>
              <span className="field-note">
                Saved as an info sheet, so reports can cite the a priori calculation (ARRIVE 2.0 item 2b).
              </span>
            </div>
          </div>
        )}
        {result && curves && <PowerCurves curves={curves} r={result} />}
      </div>
    </div>
  );
}

function EffectInputs({ form, set, solvingEffect }: {
  form: PowerForm; set: (p: Partial<PowerForm>) => void; solvingEffect: boolean;
}) {
  const k = form.kind;
  const effectField = (label: string, key: keyof PowerForm) => (solvingEffect
    ? <p className="hint-block">{label}: solved for.</p>
    : <TextNum label={label} value={form[key] as string} onChange={(v) => set({ [key]: v } as Partial<PowerForm>)} />);
  if (k === "t_two_sample" || k === "t_paired" || k === "t_one_sample") {
    const d = dFromMeans(n(form.mean1) ?? NaN, n(form.mean2) ?? NaN, n(form.sd) ?? NaN);
    return (
      <>
        {effectField(EFFECT_LABEL[k], "d")}
        {!solvingEffect && (
          <details className="power-helper">
            <summary>Compute d from means and SD</summary>
            <TextNum label={k === "t_one_sample" ? "Expected mean" : k === "t_paired" ? "Mean difference" : "Mean, group 1"}
              value={form.mean1} onChange={(mean1) => set({ mean1 })} />
            <TextNum label={k === "t_one_sample" ? "Reference value" : k === "t_paired" ? "(no difference: 0)" : "Mean, group 2"}
              value={form.mean2} placeholder={k === "t_paired" ? "0" : ""} onChange={(mean2) => set({ mean2 })} />
            <TextNum label={k === "t_paired" ? "SD of the differences" : "SD (common)"} value={form.sd}
              onChange={(sd) => set({ sd })} />
            <div className="inline-actions">
              <button type="button" disabled={d === null || !Number.isFinite(d)}
                onClick={() => d !== null && set({ d: String(Number(d.toPrecision(4))) })}>
                Use d = {d !== null && Number.isFinite(d) ? f(d) : "…"}
              </button>
            </div>
          </details>
        )}
        {solvingEffect && (
          <div className="power-helper power-raw">
            <p className="hint-block">To see the detectable effect in the measurement’s own units, give the SD:</p>
            {k === "t_two_sample" && (
              <Select label="SD from" value={form.sdSource}
                options={[["common", "One common SD"], ["groups", "Two group SDs (pooled)"]]}
                onChange={(sdSource) => set({ sdSource })} />
            )}
            {k === "t_two_sample" && form.sdSource === "groups" ? (
              <>
                <TextNum label="SD, group 1" value={form.sd1} placeholder="optional" onChange={(sd1) => set({ sd1 })} />
                <TextNum label="SD, group 2" value={form.sd2} placeholder="optional" onChange={(sd2) => set({ sd2 })}
                  note="Pooled at the n of each group: √(((n1 − 1)s1² + (n2 − 1)s2²) / (n1 + n2 − 2))." />
              </>
            ) : (
              <TextNum label={k === "t_paired" ? "SD of the differences" : "SD (common)"} value={form.sd}
                placeholder="optional" onChange={(sd) => set({ sd })} />
            )}
            <TextNum label="Measurement unit" value={form.measureUnit} placeholder="e.g. mmol/L"
              onChange={(measureUnit) => set({ measureUnit })} />
          </div>
        )}
        <p className="hint-block">Conventions: 0.2 small, 0.5 medium, 0.8 large; prefer a difference that matters biologically.</p>
      </>
    );
  }
  if (k === "anova_oneway") {
    const means = form.groupMeans.split(/[,;\s]+/).map((v) => n(v)).filter((v): v is number => v !== null);
    const fv = fFromMeans(means, n(form.groupSd) ?? NaN);
    return (
      <>
        <TextNum label="Groups (k)" value={form.k} onChange={(v) => set({ k: v })} />
        {effectField(EFFECT_LABEL[k], "f")}
        {!solvingEffect && (
          <details className="power-helper">
            <summary>Compute f from group means</summary>
            <Field label="Group means">
              <input className="constraint-value power-wide" aria-label="Group means" value={form.groupMeans} placeholder="e.g. 10, 12, 15"
                onChange={(e) => set({ groupMeans: e.target.value })} />
            </Field>
            <TextNum label="SD within groups" value={form.groupSd} onChange={(groupSd) => set({ groupSd })} />
            <div className="inline-actions">
              <button type="button" disabled={fv === null}
                onClick={() => fv !== null && set({ f: String(Number(fv.toPrecision(4))), k: String(means.length) })}>
                Use f = {fv !== null ? f(fv) : "…"}{fv !== null ? ` (k = ${means.length})` : ""}
              </button>
            </div>
          </details>
        )}
        {solvingEffect && (
          <div className="power-helper power-raw">
            <p className="hint-block">To see the detectable spread of the group means in the measurement’s own units, give the SD:</p>
            <TextNum label="SD within groups" value={form.groupSd} placeholder="optional"
              onChange={(groupSd) => set({ groupSd })} />
            <TextNum label="Measurement unit" value={form.measureUnit} placeholder="e.g. mmol/L"
              onChange={(measureUnit) => set({ measureUnit })} />
          </div>
        )}
        <p className="hint-block">Conventions: 0.1 small, 0.25 medium, 0.4 large.</p>
      </>
    );
  }
  if (k === "two_proportions") {
    const h = n(form.p1) !== null && n(form.p2) !== null
      ? hFromProportions(Math.min(1, n(form.p1)! > 1 ? n(form.p1)! / 100 : n(form.p1)!),
        Math.min(1, n(form.p2)! > 1 ? n(form.p2)! / 100 : n(form.p2)!)) : null;
    return (
      <>
        <TextNum label="Proportion 1 (control)" value={form.p1} onChange={(p1) => set({ p1 })} />
        {effectField(EFFECT_LABEL[k], "p2")}
        {!solvingEffect && h !== null && <p className="hint-block">Cohen's h = {f(h)} (0.2 small, 0.5 medium, 0.8 large).</p>}
        <Select label="Method" value={form.propMethod}
          options={[["z", "Normal approximation (pooled)"], ["z_cc", "With continuity correction"],
            ["arcsine", "Arcsine (Cohen's h)"], ["fisher_exact", "Fisher's exact test (exact power)"]]}
          onChange={(propMethod) => set({ propMethod })} />
      </>
    );
  }
  if (k === "one_proportion") {
    return (
      <>
        <TextNum label="Reference proportion p0" value={form.p0} onChange={(p0) => set({ p0 })} />
        {effectField(EFFECT_LABEL[k], "p")}
      </>
    );
  }
  if (k === "mcnemar") {
    return (
      <>
        <TextNum label="Proportion of discordant pairs" value={form.pDiscordant}
          onChange={(pDiscordant) => set({ pDiscordant })} />
        {effectField(EFFECT_LABEL[k], "oddsRatio")}
      </>
    );
  }
  if (k === "correlation") {
    return (
      <>
        <TextNum label="ρ0 (null hypothesis)" value={form.rho0} onChange={(rho0) => set({ rho0 })} />
        {effectField(EFFECT_LABEL[k], "rho")}
        <Select label="Method" value={form.corrMethod}
          options={[["exact", "Exact distribution of r"], ["fisher_z", "Fisher z approximation"]]}
          onChange={(corrMethod) => set({ corrMethod })} />
      </>
    );
  }
  if (k === "logrank") {
    const hr = hrFromMedians(n(form.medianControl) ?? NaN, n(form.medianTreated) ?? NaN);
    return (
      <>
        {effectField(EFFECT_LABEL[k], "hr")}
        <TextNum label="Median survival, control" value={form.medianControl} placeholder="optional"
          onChange={(medianControl) => set({ medianControl })}
          note="With accrual and follow-up, events are turned into subjects (exponential survival)." />
        {!solvingEffect && (
          <TextNum label="Median survival, treated" value={form.medianTreated} placeholder="optional"
            onChange={(medianTreated) => set({ medianTreated })} />
        )}
        {!solvingEffect && hr !== null && Number.isFinite(hr) && (
          <div className="inline-actions">
            <button type="button" onClick={() => set({ hr: String(Number(hr.toPrecision(4))) })}>
              Use HR = {f(hr)} from the medians
            </button>
          </div>
        )}
        <TextNum label="Accrual period" value={form.accrual} placeholder="0" onChange={(accrual) => set({ accrual })} />
        <TextNum label="Follow-up after accrual" value={form.followup} onChange={(followup) => set({ followup })} />
        <Select label="Events formula" value={form.lrMethod}
          options={[["schoenfeld", "Schoenfeld (1983)"], ["freedman", "Freedman (1982)"]]}
          onChange={(lrMethod) => set({ lrMethod })} />
      </>
    );
  }
  return (
    <>
      <TextNum label="Degrees of freedom" value={form.df} onChange={(df) => set({ df })} />
      {effectField(EFFECT_LABEL[k], "w")}
      <p className="hint-block">Conventions: 0.1 small, 0.3 medium, 0.5 large.</p>
    </>
  );
}

function PowerSummary({ r, form }: { r: PowerResult; form: PowerForm }) {
  const rows: [string, string][] = [];
  rows.push(["Power achieved", `${pct(r.power)}${r.target_power ? ` (target ${pct(r.target_power)})` : ""}`]);
  if (r.kind === "logrank") {
    rows.push(["Events needed", `${f(r.events)}${r.events_exact ? ` (exact ${f(r.events_exact)})` : ""}`]);
    if (r.p_event != null) rows.push(["Probability of an event", pct(r.p_event)]);
  }
  if (r.n_per_group?.length && (r.kind !== "logrank" || r.n_total)) {
    const same = r.n_per_group.every((x) => x === r.n_per_group![0]);
    rows.push([same ? "n per group" : "n per group", same && r.n_per_group.length > 2
      ? `${r.n_per_group[0]} × ${r.n_per_group.length}` : r.n_per_group.join(" and ")]);
  }
  if (r.n_total) rows.push([r.n_per_group?.length ? "Total N" : nLabel(form), String(r.n_total)]);
  for (const [label, v] of unroundedN(r)) rows.push([label, f(v)]);
  if (r.justification?.allocate) rows.push(["To allocate (with attrition)", r.justification.allocate.join(" + ")]);
  rows.push(["Effect size", `${r.effect.name} = ${f(r.effect.value)}${r.solve === "effect" ? " (detectable)" : ""}`]);
  for (const raw of rawDetectable(form, r)) rows.push([raw.label, raw.text]);
  if (typeof r.effect.cohens_h === "number") rows.push(["Cohen's h", f(Math.abs(r.effect.cohens_h as number))]);
  if (typeof r.effect.eta_squared === "number") rows.push(["η²", f(r.effect.eta_squared as number)]);
  if (r.ncp !== undefined) rows.push(["Noncentrality", f(r.ncp)]);
  if (r.df !== undefined) rows.push(["Degrees of freedom", f(r.df)]);
  if (r.df1 !== undefined) rows.push(["Degrees of freedom", `${r.df1}, ${r.df2}`]);
  if (r.critical_t !== undefined) rows.push(["Critical t", f(r.critical_t)]);
  if (r.critical_f !== undefined) rows.push(["Critical F", f(r.critical_f)]);
  if (r.critical_chi2 !== undefined) rows.push(["Critical χ²", f(r.critical_chi2)]);
  if (r.critical_r) rows.push(["Critical r", r.critical_r.map((x) => f(x)).join(", ")]);
  if (r.lower_critical != null || r.upper_critical != null) {
    rows.push(["Critical counts", [r.lower_critical != null ? `≤ ${r.lower_critical}` : "", r.upper_critical != null ? `≥ ${r.upper_critical}` : ""].filter(Boolean).join(" or ")]);
  }
  if (r.actual_alpha !== undefined) rows.push(["Actual α", f(r.actual_alpha)]);
  return (
    <div className="result-card power-summary">
      <h3>{KIND_LABELS[r.kind]}</h3>
      <KV rows={rows} className="power-kv" />
    </div>
  );
}

function PowerCurves({ curves, r }: { curves: { n: Curve; e: Curve; nLabel: string }; r: PowerResult }) {
  const dark = useDark();
  const figs = useMemo(() => {
    const chrome = chromeFor(dark);
    const st = seriesStyle(0, dark, DEFAULT_SCHEME);
    const mk = (c: Curve, xTitle: string, mark: number, log: boolean) => {
      const traces: Plotly.Data[] = [{ x: c.x, y: c.y.map((v) => 100 * v), mode: "lines", type: "scatter",
        line: { color: st.color, width: 2.2 }, hovertemplate: `${xTitle} %{x:.4g}: power %{y:.1f}%<extra></extra>` } as Plotly.Data];
      const layout = baseLayout(chrome, xTitle, "Power (%)", {
        showlegend: false, margin: { l: 56, r: 12, t: 10, b: 56 },
        shapes: [
          { type: "line", xref: "paper", yref: "y", x0: 0, x1: 1, y0: 100 * (r.target_power ?? 0.8), y1: 100 * (r.target_power ?? 0.8),
            line: { color: chrome.muted, width: 1, dash: "dash" } },
          { type: "line", xref: "x", yref: "paper", x0: mark, x1: mark, y0: 0, y1: 1,
            line: { color: chrome.muted, width: 1, dash: "dot" } },
        ],
      });
      layout.yaxis = { ...layout.yaxis, range: [0, 102] };
      if (log) layout.xaxis = { ...layout.xaxis, type: "log" };
      return { traces, layout };
    };
    return {
      n: mk(curves.n, curves.nLabel, nForCurve(r), false),
      e: curves.e.x.length ? mk(curves.e, r.effect.name, r.effect.value, r.kind === "logrank" || r.kind === "mcnemar") : null,
    };
  }, [curves, r, dark]);
  return (
    <div className="power-curves">
      <div className="power-curve">
        <PlotlyChart data={figs.n.traces} layout={figs.n.layout} filename="power-vs-n"
          label="Power against sample size" dark={dark} scheme={DEFAULT_SCHEME} />
      </div>
      {figs.e && (
        <div className="power-curve">
          <PlotlyChart data={figs.e.traces} layout={figs.e.layout} filename="power-vs-effect"
            label="Power against effect size" dark={dark} scheme={DEFAULT_SCHEME} />
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------ randomisation */

function RandomTool() {
  const [form, setForm] = useState<RandomForm>(defaultRandomForm);
  const [result, setResult] = useState<RandomResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const set = (p: Partial<RandomForm>) => setForm((x) => ({ ...x, ...p }));
  const generate = async () => {
    const o = randomOptions(form);
    if ("error" in o) { setError(o.error); return; }
    const r = await analyzeAsync({ analysis: "randomize", data: {}, options: o.options },
      { priority: "user" }) as RandomResult;
    if (r.error) { setError(String(r.error)); setResult(null); return; }
    setError(null);
    setResult(r);
    if (!form.seed.trim()) set({ seed: String(r.seed) });
  };
  const download = () => {
    if (!result) return;
    saveBlob(new Blob([randomCsv(result)], { type: "text/csv" }), `randomisation-${result.method}-seed-${result.seed}.csv`);
  };
  return (
    <div className="power-grid">
      <div className="controls power-inputs">
        <section>
          <h3>Design</h3>
          <Field label="Groups">
            <input className="constraint-value power-wide" aria-label="Groups" value={form.groups} onChange={(e) => set({ groups: e.target.value })} />
          </Field>
          <TextNum label="Allocation ratio" value={form.ratio} onChange={(ratio) => set({ ratio })}
            note="One whole number per group, e.g. 1, 1 or 2, 1." />
          <Select label="Method" value={form.method}
            options={[["block", "Permuted blocks"], ["stratified", "Stratified permuted blocks"],
              ["shuffled", "Random allocation (exact ratio, shuffled)"], ["simple", "Simple randomisation (coin toss)"]]}
            onChange={(method) => set({ method })} />
          {(form.method === "block" || form.method === "stratified") && (
            <TextNum label="Block sizes" value={form.blockSizes} onChange={(blockSizes) => set({ blockSizes })}
              note="Several sizes are mixed at random so the next allocation cannot be guessed." />
          )}
          {form.method === "stratified" ? (
            <Field label="Strata (name: n, one per line)">
              <textarea className="constraint-value power-wide" aria-label="Strata" rows={3} value={form.strata} onChange={(e) => set({ strata: e.target.value })} />
            </Field>
          ) : (
            <TextNum label="Number of units" value={form.n} onChange={(v) => set({ n: v })} />
          )}
          <Field label="ID prefix">
            <input className="constraint-value" aria-label="ID prefix" value={form.idPrefix} onChange={(e) => set({ idPrefix: e.target.value })} />
          </Field>
          <TextNum label="Seed" value={form.seed} placeholder="new random seed" onChange={(seed) => set({ seed })}
            note="Keep the seed to regenerate the same list." />
          <div className="inline-actions">
            <button type="button" className="btn-primary" onClick={() => void generate()}>Generate list</button>
            <button type="button" onClick={() => { set({ seed: "" }); setResult(null); }}>New seed</button>
          </div>
        </section>
      </div>
      <div className="power-output">
        {error && <div className="results-error" role="alert">{error}</div>}
        {result && (
          <div className="result-card">
            <h3>Allocation of {result.n} units</h3>
            <p className="hint-block">
              Method: {result.method}; seed {result.seed}
              {result.block_sizes ? `; block sizes ${result.block_sizes.join(", ")}` : ""}.
              {" "}Counts: {Object.entries(result.counts).map(([g, c]) => `${g} ${c}`).join(", ")}.
            </p>
            <div className="inline-actions">
              <button type="button" className="btn-primary" onClick={download}>Download CSV</button>
              <span className="field-note">
                For blinding, keep the list away from whoever allocates, treats or
                assesses the units, and code the groups (A, B) on the cages or samples.
              </span>
            </div>
            <div className="power-list">
              <Grid caption="Allocation list"
                head={["#", "ID", ...(result.list.some((x) => x.stratum) ? ["Stratum"] : []),
                  ...(result.list.some((x) => x.block !== undefined) ? ["Block"] : []), "Group"]}
                rows={result.list.slice(0, 200).map((x) => [String(x.sequence), x.id,
                  ...(x.stratum !== undefined ? [x.stratum] : []), ...(x.block !== undefined ? [String(x.block)] : []), x.group])} />
              {result.list.length > 200 && <p className="hint-block">First 200 of {result.list.length}; the CSV has all.</p>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
