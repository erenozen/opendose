// Controls (with a matrix paste box), results and methods text of the
// drug-combination synergy analysis.
import { useState } from "react";
import { useProject } from "../../app/context";
import { updateTable } from "../../project/ops";
import { formatSig } from "../../types";
import CopyableMethods from "../common/CopyableMethods";
import { fmtP } from "../common/statFormat";
import type { ControlsProps, ResultsProps } from "../types";
import { Chip } from "./kit/ui";
import {
  MATRIX_VIEWS, MODEL_LABEL, MODEL_LONG, SYNERGY_MODELS, matricesFor, monotherapyIssues, parseMatrixBlocks, predictedCells,
  scoreReading, scoresVsCi, synergyTable, viewMatrix,
  defaultFixed, isMultiDrug, sliceResult,
  type ExtraDrug, type MatrixTableChoice, type SynergyColumns, type SynergyModel, type SynergyOptions,
} from "./synergyModel";
import { Card, Check, Grid, Note, Problem, Row, Select, TextIn, Warnings } from "./ui";

/* eslint-disable @typescript-eslint/no-explicit-any */
type R = Record<string, any>;

const f = (v: unknown, sig?: number) => (typeof v === "number" ? formatSig(v, sig) : "n/a");

function PasteMatrix({ parentId, yTitle }: { parentId: string; yTitle: string }) {
  const { apply } = useProject();
  const [text, setText] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const fill = () => {
    const m = parseMatrixBlocks(text);
    if ("error" in m) { setMsg(m.error); return; }
    apply((p) => updateTable(p, parentId, () => synergyTable(m.conc1, m.conc2, m.reps, yTitle)));
    setMsg(`Filled a ${m.conc1.length} × ${m.conc2.length} matrix${m.reps.length > 1
      ? ` with ${m.reps.length} replicates` : ""}.`);
  };
  return (
    <details className="assay-paste">
      <summary>Paste a combination matrix</summary>
      <p className="hint-block">
        First row: drug 2 concentrations; first column: drug 1 concentrations
        (include 0, the drug alone); the responses in between. Separate
        replicate matrices with a blank line. This replaces the table.
      </p>
      <textarea aria-label="Combination matrix to paste" value={text}
        placeholder={"\t0\t0.2\t0.8\t3.1\n0\t100\t96\t88\t70\n10\t85\t70\t51\t30"}
        onChange={(e) => setText(e.target.value)} />
      <div className="inline-actions">
        <button type="button" disabled={!text.trim()} onClick={fill}>Fill the table</button>
        {msg && <span className="field-note" role="status">{msg}</span>}
      </div>
    </details>
  );
}

export function SynergyControls({ sheet, table, options: o, onChange, readOnly }: ControlsProps<SynergyOptions>) {
  const set = (patch: Partial<SynergyOptions>) => onChange({ ...o, ...patch });
  const names = table.datasets.map((d, i) => d.name.trim() || `Variable ${i + 1}`);
  const multi = isMultiDrug(o, table);
  const setExtra = (k: number, patch: Partial<ExtraDrug>) =>
    set({ extraDrugs: o.extraDrugs.map((e, n) => (n === k ? { ...e, ...patch } : e)) });
  const col = (key: keyof SynergyColumns, label: string, optional = false) => (
    <Row label={label}>
      <select value={o.columns[key]} onChange={(e) => set({ columns: { ...o.columns, [key]: e.target.value } })}>
        <option value="">{optional ? "(none)" : "Choose…"}</option>
        {names.map((n) => <option key={n} value={n}>{n}</option>)}
      </select>
    </Row>
  );
  return (
    <div className="controls">
      <section>
        <h3>Layout</h3>
        {table.type === "multivariable" ? (
          <>
            {col("conc1", "Drug 1 concentration")}
            {col("conc2", "Drug 2 concentration")}
            {o.extraDrugs.map((e, k) => (
              <div key={k} className="assay-extra-drug">
                <Row label={`Drug ${k + 3} concentration`}>
                  <select value={e.conc} onChange={(ev) => setExtra(k, { conc: ev.target.value })}>
                    <option value="">Choose…</option>
                    {names.map((n) => <option key={n} value={n}>{n}</option>)}
                  </select>
                </Row>
                <TextIn label={`Drug ${k + 3} name`} inputMode="text" value={e.name}
                  onChange={(name) => setExtra(k, { name })} />
                {!readOnly && (
                  <button type="button" className="link-button"
                    onClick={() => set({ extraDrugs: o.extraDrugs.filter((_, n) => n !== k) })}>
                    Remove drug {k + 3}
                  </button>
                )}
              </div>
            ))}
            {!readOnly && (
              <button type="button" className="link-button"
                onClick={() => set({ extraDrugs: [...o.extraDrugs, { name: `Drug ${o.extraDrugs.length + 3}`, conc: "" }] })}>
                Add a drug (three or more in combination)
              </button>
            )}
            {col("response", "Response")}
            {col("replicate", "Replicate (block)", true)}
            <p className="hint-block">One row per well, as SynergyFinder's long format.</p>
          </>
        ) : (
          <>
            <p className="hint-block">
              Row titles are drug 1 concentrations, data-set titles drug 2
              concentrations (0 = the drug alone), and each subcolumn is one
              replicate matrix.
            </p>
            {!readOnly && <PasteMatrix parentId={sheet.parentId} yTitle={table.yTitle || "Viability (%)"} />}
          </>
        )}
        <TextIn label={multi ? "Drug 1 name" : "Drug 1 (rows)"} inputMode="text" value={o.drug1}
          onChange={(drug1) => set({ drug1 })} />
        <TextIn label={multi ? "Drug 2 name" : "Drug 2 (columns)"} inputMode="text" value={o.drug2}
          onChange={(drug2) => set({ drug2 })} />
        <TextIn label="Concentration unit" inputMode="text" value={o.unit} width={80}
          onChange={(unit) => set({ unit })} />
      </section>
      <section>
        <h3>Response</h3>
        <Select label="Values are" value={o.responseKind}
          options={[["viability", "% viability (100 = untreated)"], ["inhibition", "% inhibition (0 = untreated)"]]}
          onChange={(responseKind) => set({ responseKind })}
          hint="Viability is converted to % inhibition (100 − viability) before scoring." />
        <Select label="Baseline correction" value={o.baselineCorrection}
          options={[["none", "None"], ["part", "Negative responses only"], ["all", "All responses"]]}
          onChange={(baselineCorrection) => set({ baselineCorrection })}
          hint="SynergyFinder's correction for a negative response baseline: the lower of the two fitted monotherapy minimums is removed, scaled by (100 − response)/100." />
        <Check label="P values for replicated matrices (rescores 10 resampled matrices; slower)"
          checked={o.replicateP} onChange={(replicateP) => set({ replicateP })} />
      </section>
      {multi ? (
        <section>
          <h3>Three or more drugs</h3>
          <p className="hint-block">
            HSA, Bliss, Loewe, ZIP and the consensus are scored for every combination (SynergyFinder Plus).
            The outlier check, filling missing cells, MuSyC, CSS, the most synergistic area and Chou-Talalay
            indices are defined for two drugs only and are not offered here.
          </p>
        </section>
      ) : (<>
      <section>
        <h3>Outliers and missing cells</h3>
        <Select label="Outlier check" value={o.outliers}
          options={[["none", "Off"], ["flag", "Flag cells (scores unchanged)"],
            ["replace", "Replace flagged cells by their prediction"]]}
          onChange={(outliers) => set({ outliers })}
          hint="A cell is flagged when it is more than 20% inhibition from the response its row and column dose-response fits predict without it (SynergyFinder's cut-off). Refits every curve once per cell, so it takes several seconds." />
        <Check label="Fill missing cells from the dose-response fits"
          checked={o.impute} onChange={(impute) => set({ impute })} />
      </section>
      <section>
        <h3>Potency and efficacy</h3>
        <Check label="Fit MuSyC (separates potency from efficacy synergy; a few seconds)"
          checked={o.musyc} onChange={(musyc) => set({ musyc })} />
      </section>
      </>)}
      <section>
        <h3>Models to show</h3>
        <div className="assay-models">
          {SYNERGY_MODELS.map((m) => (
            <Check key={m} label={`${MODEL_LABEL[m]} (${MODEL_LONG[m].toLowerCase()})`}
              checked={o.models[m]} onChange={(v) => set({ models: { ...o.models, [m]: v } })} />
          ))}
        </div>
      </section>
    </div>
  );
}

function Matrix({ title, m, c1, c2, sig = 3, marked, corner = "Drug 1 \\ Drug 2" }: {
  title: string; m: (number | null)[][]; c1: number[]; c2: number[]; sig?: number; marked?: Set<string>;
  corner?: string;
}) {
  return (
    <>
      <h4>{title}</h4>
      <Grid caption={title} head={[corner, ...c2.map((c) => formatSig(c))]}
        rows={m.map((row, i) => [formatSig(c1[i]), ...row.map((v, j) => (v === null ? "–"
          : `${formatSig(v, sig)}${marked?.has(`${i},${j}`) ? "*" : ""}`))])} />
    </>
  );
}

/** "28.1 at 156–2500 × 3.13–50": the window's mean synergy and its doses. */
function msaText(a: R | null | undefined): string {
  if (!a || typeof a.score !== "number") return "n/a (fewer than 3 × 3 combination doses)";
  const r = (v: number[]) => `${formatSig(v[0])}–${formatSig(v[1])}`;
  return `${formatSig(a.score)} at ${r(a.conc1)} × ${r(a.conc2)}`;
}

function Checked({ outliers, filled, d1, d2, unit }: {
  outliers: R | null; filled: R[]; d1: string; d2: string; unit: string;
}) {
  const cells = (outliers?.cells ?? []) as R[];
  const missing = filled.filter((c) => c.reason === "missing");
  return (
    <Card title="Outliers and filled cells">
      {outliers && (cells.length === 0
        ? <p className="hint-block">No cell is more than {f(outliers.threshold)}% inhibition from its prediction.</p>
        : <>
          <Grid caption="Flagged cells" head={[`${d1}${unit}`, `${d2}${unit}`, "Observed (% inhibition)",
            "Predicted", "Difference", "Cell", "Scored as"]}
            rows={cells.map((c) => [formatSig(c.conc1), formatSig(c.conc2), f(c.observed), f(c.predicted),
              f(c.deviation), c.kind, outliers.action === "replace" ? "prediction" : "observed (flag only)"])} />
          <p className="hint-block">
            Flagged: more than {f(outliers.threshold)}% inhibition from the response predicted, without the cell,
            by its row and its column dose-response fits (a combination cell must disagree with both). SynergyFinder
            predicts with cNMF instead, so its flags can differ. Check the wells before trusting either.
          </p>
        </>)}
      {missing.length > 0 && (
        <>
          <Grid caption="Filled missing cells" head={[`${d1}${unit}`, `${d2}${unit}`, "Filled with (% inhibition)"]}
            rows={missing.map((c) => [formatSig(c.conc1), formatSig(c.conc2), f(c.value)])} />
          <p className="hint-block">
            Filled values are estimates from the row and column dose-response fits, scored as if measured.
            A dose on the steep part of a curve is poorly determined without its own value, and a filled
            monotherapy dose moves that drug&apos;s IC50, RI and every model that uses its curve: repeat the
            well when you can.
          </p>
        </>
      )}
    </Card>
  );
}

function Musyc({ m, d1, d2, unit }: { m: R; d1: string; d2: string; unit: string }) {
  const ci = (k: string) => {
    const c = m.ci95?.[k];
    return Array.isArray(c) ? `${formatSig(c[0])} to ${formatSig(c[1])}` : "n/a";
  };
  // a direction is read only when the 95% interval excludes "no change"
  const sure = (k: string, v: number): number => {
    const c = m.ci95?.[k];
    if (!Array.isArray(c)) return 0;
    return c[0] > v ? 1 : c[1] < v ? -1 : 0;
  };
  const readA = (k: string, by: string, of: string) => {
    const s = sure(k, 0);
    return s > 0 ? `${by} makes ${of} more potent` : s < 0 ? `${by} makes ${of} less potent`
      : `no clear change in ${of}'s potency from ${by}`;
  };
  const betaSign = sure("beta", 0);
  const readB = betaSign > 0 ? "the combination reaches more effect than the better drug alone"
    : betaSign < 0 ? "the combination reaches less effect than the better drug alone"
      : "no clear difference from the better drug's maximal effect";
  const rows: [string, string, string][] = [
    [`α12: ${d1} changes ${d2}'s potency (fold)`, f(m.alpha12), ci("alpha12")],
    ["  log10 α12", f(m.log10_alpha12), ci("log10_alpha12")],
    [`α21: ${d2} changes ${d1}'s potency (fold)`, f(m.alpha21), ci("alpha21")],
    ["  log10 α21", f(m.log10_alpha21), ci("log10_alpha21")],
    ["β (efficacy synergy)", f(m.beta), ci("beta")],
    ["β at the highest doses tested (βobs)", f(m.beta_obs), ci("beta_obs")],
    ["E0 (no drug, % inhibition)", f(m.E0), ci("E0")],
    [`E1 (${d1} alone, maximal)`, f(m.E1), ci("E1")],
    [`E2 (${d2} alone, maximal)`, f(m.E2), ci("E2")],
    ["E3 (both, maximal)", f(m.E3), ci("E3")],
    [`EC50 ${d1}${unit}`, f(m.C1), ci("C1")],
    [`EC50 ${d2}${unit}`, f(m.C2), ci("C2")],
    [`Hill slope ${d1}`, f(m.h1), ci("h1")],
    [`Hill slope ${d2}`, f(m.h2), ci("h2")],
  ];
  return (
    <Card title="MuSyC: potency and efficacy synergy">
      {(m.notes ?? []).length > 0 && <Warnings list={m.notes} />}
      <Grid caption="MuSyC parameters" head={["Parameter", "Estimate", "95% interval"]} rows={rows} />
      <p className="hint-block">
        Read from the 95% intervals: {readA("log10_alpha12", d1, d2)}; {readA("log10_alpha21", d2, d1)} (α &gt; 1
        is synergistic potency); on efficacy, {readB} (β &gt; 0 is synergistic efficacy). A direction is
        stated only when its interval excludes no change. R² = {f(m.r_squared, 3)}, RMS = {f(m.rms)}; intervals from {m.n_ci ?? 0} Monte Carlo
        refits of the fitted surface plus noise (Wooten et al. 2021). Model: MuSyC without cooperativity
        (Meyer et al. 2019; Wooten et al. 2021), fitted to % inhibition.
      </p>
    </Card>
  );
}

function Sensitivity({ s, d1, d2, unit }: { s: R; d1: string; d2: string; unit: string }) {
  const ic = (e: R) => (typeof e?.ic50 !== "number" ? "n/a (monotherapy not fitted)"
    : `${formatSig(e.ic50)}${e.ic50_capped ? " (capped at the highest dose)" : ""}`);
  return (
    <Card title="Sensitivity (SynergyFinder)">
      <Grid caption="Monotherapy sensitivity" head={["Drug", `Relative IC50${unit}`, "RI (%)",
        "CSS with the other drug at its IC50 (%)"]}
        rows={[[d1, s.drug1, s.css1], [d2, s.drug2, s.css2]].map(([n, e, css]) =>
          [n as string, ic(e as R), f((e as R)?.ri), f(css)])} />
      <p className="hint-block">
        CSS (combination sensitivity score) = {f(s.css)}%, the mean of the two. RI is the mean fitted
        % inhibition of a drug alone over its tested dose range on a log scale (the area under the
        curve divided by the range); CSS is the same for one drug while the other is held at its
        relative IC50 (Malyutina et al. 2019). Relative IC50 is the monotherapy fit’s EC50, capped at
        the highest dose tested.
      </p>
    </Card>
  );
}

/** Results of three or more drugs (engine synergy_multi). */
function MultiResults({ options, result }: { options: SynergyOptions; result: R }) {
  const names = result.drugs as string[];
  const concs = result.concs as number[][];
  const [pair, setPair] = useState<[number, number]>([0, 1]);
  const [fixed, setFixed] = useState<number[]>(() => defaultFixed(result));
  const [view, setView] = useState<MatrixTableChoice>("default");
  const shown = SYNERGY_MODELS.filter((m) => options.models[m]);
  const unit = options.unit ? ` ${options.unit}` : "";
  const reps = result.n_replicates as number;
  const n = names.length;
  const [a, b] = pair[0] < n && pair[1] < n && pair[0] !== pair[1] ? pair : [0, 1];
  const fx = concs.map((c, d) => (fixed[d] !== undefined && fixed[d] < c.length ? fixed[d] : c.length - 1));
  const sl = sliceResult(result, a, b, fx);
  const drugOpts = names.map((nm, d) => [String(d), nm] as const);
  const rows = [...shown.map((m) => [`${MODEL_LABEL[m]} (${MODEL_LONG[m].toLowerCase()})`, m] as const),
    ["Bliss / Loewe consensus", "consensus"] as const];
  const others = names.map((nm, d) => (d === a || d === b ? null
    : `${nm} at ${formatSig(concs[d][fx[d]])}${unit}`)).filter(Boolean).join(", ");
  const cells = (result.cells ?? []) as R[];
  return (
    <>
      <Card title={`Synergy scores (${n} drugs)`}>
        <Warnings list={result.warnings} />
        <Grid caption="Summary synergy scores" head={["Model", "Score (every combination)", `Score (all ${n} drugs)`,
          ...(reps > 1 ? ["SD over replicates"] : []), "P value", "Reading"]}
          rows={rows.map(([label, k]) => {
            const e = result.models[k] as R;
            return [label, <span className="assay-score" key={k}>{f(e.score)}</span>, f(e.score_all_drugs),
              ...(reps > 1 ? [f(e.score_sd)] : []), e.p_value == null ? "n/a" : fmtP(e.p_value),
              scoreReading(e.score)];
          })} />
        <p className="hint-block">
          Each score is the mean, over the combinations, of observed minus expected % inhibition under that
          model’s definition of no interaction; a combination holding only some of the drugs is scored with the
          drugs it holds. “Every combination” averages all cells with two or more drugs, “all {n} drugs” only the
          cells holding every drug. Higher-order HSA, Bliss, Loewe and ZIP as in SynergyFinder Plus (Zheng et al.
          2022). P values follow SynergyFinder (z = |mean| / SD of {result.p_value_basis
            ? `the ${result.p_value_basis}` : "the resampled summary scores (not computed: turned off)"}): a measure of
          consistency, not a test of the mean.
        </p>
      </Card>
      <Card title="Single drugs">
        <Grid caption="Single-drug fits" head={["Drug", "Bottom", "Top", `EC50${unit}`, "Hill slope", "R²",
          `Relative IC50${unit}`, "RI (%)"]}
          rows={(result.monotherapy as R[]).map((m, d) => {
            const sens = (result.sensitivity as R[])[d] ?? {};
            return [String(m.drug), ...(m.fitted
              ? [f(m.params.Bottom), f(m.params.Top), f(m.params.EC50), f(m.params.HillSlope), f(m.r_squared)]
              : ["not fitted", "", "", "", ""]),
            typeof sens.ic50 === "number" ? `${formatSig(sens.ic50)}${sens.ic50_capped ? " (capped)" : ""}` : "n/a",
            f(sens.ri)];
          })} />
        <p className="hint-block">Each drug alone (the other drugs at 0), fitted with a four-parameter
          log-logistic model; RI is the mean fitted % inhibition over its tested doses on a log scale.</p>
      </Card>
      <Card title="Two-drug slices">
        <Select label="Rows" value={String(a)} options={drugOpts}
          onChange={(v) => setPair([Number(v), Number(v) === b ? a : b])} />
        <Select label="Columns" value={String(b)} options={drugOpts}
          onChange={(v) => setPair([Number(v) === a ? b : a, Number(v)])} />
        {names.map((nm, d) => (d === a || d === b ? null : (
          <Select key={d} label={`${nm} at${unit}`} value={String(fx[d])}
            options={concs[d].map((c, k) => [String(k), formatSig(c)] as const)}
            onChange={(v) => setFixed(fx.map((k, e) => (e === d ? Number(v) : k)))} />
        )))}
        <Row label="Show">
          <select aria-label="Show matrices" value={view}
            onChange={(e) => setView(e.target.value as MatrixTableChoice)}>
            <option value="default">Observed response and synergy</option>
            <option value="all">Every matrix (observed, expected, fitted, synergy)</option>
            {MATRIX_VIEWS.filter((d) => d.model === null || shown.includes(d.model)).map((d) => (
              <option key={d.key} value={d.key}>{d.label}</option>
            ))}
          </select>
        </Row>
        <p className="hint-block">Rows are {names[a]}, columns {names[b]}{unit}{others ? `; ${others}` : ""}.
          Synergy is 0 where fewer than two drugs are present; “–” marks a combination not measured.</p>
        {sl && matricesFor(view, shown).map((d) => {
          const m = viewMatrix(sl, d.key);
          return m ? <Matrix key={d.key} title={d.label} m={m} c1={concs[a]} c2={concs[b]}
            corner={`${names[a]} \\ ${names[b]}`} /> : null;
        })}
      </Card>
      <Card title="Every combination">
        <Grid caption="Every combination" head={[...names.map((nm) => `${nm}${unit}`), "Drugs present",
          "Response (% inhibition)", ...shown.map((m) => `${MODEL_LABEL[m]} synergy`), "Consensus synergy"]}
          rows={cells.map((c) => [...(c.concs as number[]).map((v) => formatSig(v)), String(c.n_drugs),
            f(c.response), ...shown.map((m) => (c.n_drugs >= 2 ? f(c[m]?.synergy) : "")),
            c.n_drugs >= 2 ? f(c.consensus?.synergy) : ""])} />
      </Card>
    </>
  );
}

export function SynergyResults({ options, result }: ResultsProps<SynergyOptions, R>) {
  const [view, setView] = useState<MatrixTableChoice>("default");
  if (!result) return null;
  if (result.error) return <Problem result={result} />;
  if (result.analysis === "synergy_multi") return <MultiResults options={options} result={result} />;
  const shown = SYNERGY_MODELS.filter((m) => options.models[m]);
  const c1 = result.conc1 as number[];
  const c2 = result.conc2 as number[];
  const d1 = result.drug1 as string;
  const d2 = result.drug2 as string;
  const unit = options.unit ? ` ${options.unit}` : "";
  const reps = result.n_replicates as number;
  const mono = result.monotherapy as R;
  const ct = result.chou_talalay as R;
  const issues = monotherapyIssues(result);
  const contradiction = scoresVsCi(result, shown);
  const predicted = predictedCells(result);
  return (
    <>
      <Card title="Synergy scores">
        <Warnings list={result.warnings} />
        <Grid caption="Summary synergy scores" head={["Model", "Score", ...(reps > 1 ? ["SD over replicates"] : []),
          "P value", `Most synergistic area (${d1} × ${d2}${unit})`, "Reading"]}
          rows={[...shown.map((m) => [`${MODEL_LABEL[m]} (${MODEL_LONG[m].toLowerCase()})`, result.models[m] as R, m] as const),
            ...(result.consensus ? [["Bliss / Loewe consensus", result.consensus as R, "consensus"] as const] : [])]
            .map(([label, e, key]) => [label,
              <span className="assay-score" key={key}>{f(e.score)}</span>,
              ...(reps > 1 ? [key === "consensus" ? "" : f(e.score_sd)] : []),
              e.p_value == null ? "n/a" : fmtP(e.p_value),
              msaText(e.most_synergistic_area), scoreReading(e.score)])} />
        <p className="hint-block">
          Each score is the mean, over the combination cells, of observed minus
          expected % inhibition under that model’s definition of no interaction.
          Above 10: likely synergistic; −10 to 10: likely additive; below −10:
          likely antagonistic (SynergyFinder’s reading).
          {reps > 1 && ` The SD is over the ${reps} replicate matrices, each scored separately.`}
          {" "}The consensus takes, at each dose pair, the largest of the HSA, Bliss and Loewe
          expectations, so its synergy is the most conservative of the three. The most synergistic
          area is the 3 × 3 block of adjacent combination doses with the highest mean synergy.
        </p>
        <p className="hint-block">
          P values follow SynergyFinder: z = |mean| / SD of {result.p_value_basis
            ? `the ${result.p_value_basis}` : "the resampled summary scores (not computed: turned off)"},
          P = exp(−0.717z − 0.416z²). Dividing by the SD rather than a standard error makes this a
          measure of how consistent the synergy is, not a test of the mean; with replicates it is
          often vanishingly small. Read it beside the score and the landscape.
        </p>
        <h4>Monotherapy fits (four-parameter log-logistic, % inhibition)</h4>
        <Grid caption="Monotherapy fits" head={["Drug", "Bottom", "Top", `EC50${unit}`, "Hill slope", "R²"]}
          rows={[mono.drug1, mono.drug2].map((m: R, i) => [i ? d2 : d1,
            ...(m.fitted ? [f(m.params.Bottom), f(m.params.Top), f(m.params.EC50), f(m.params.HillSlope), f(m.r_squared)]
              : ["not fitted", "", "", "", ""])])} />
      </Card>
      {(result.outliers || (result.filled_cells ?? []).length > 0) && (
        <Checked outliers={result.outliers as R | null} filled={(result.filled_cells ?? []) as R[]}
          d1={d1} d2={d2} unit={unit} />
      )}
      {result.sensitivity && <Sensitivity s={result.sensitivity as R} d1={d1} d2={d2} unit={unit} />}
      {result.musyc && <Musyc m={result.musyc as R} d1={d1} d2={d2} unit={unit} />}
      <Card title="Synergy at each dose pair">
        <Row label="Show">
          <select aria-label="Show matrices" value={view}
            onChange={(e) => setView(e.target.value as MatrixTableChoice)}>
            <option value="default">Observed response and synergy</option>
            <option value="all">Every matrix (observed, expected, fitted, synergy)</option>
            {MATRIX_VIEWS.filter((d) => d.model === null || shown.includes(d.model)).map((d) => (
              <option key={d.key} value={d.key}>{d.label}</option>
            ))}
          </select>
        </Row>
        <p className="hint-block">Rows are {d1}, columns {d2}{unit}; responses in % inhibition. Synergy is
          observed minus expected % inhibition (ZIP: the fitted response minus the expected); positive
          values mean more effect than the model expects. Copy results or CSV above exports the
          matrices shown.</p>
        {matricesFor(view, shown).map((d) => {
          const m = viewMatrix(result, d.key);
          return m ? <Matrix key={d.key} title={d.label} m={m} c1={c1} c2={c2} marked={predicted} /> : null;
        })}
        {predicted.size > 0 && (
          <p className="hint-block">
            * Not measured: {predicted.size} cell(s) were scored at the response predicted by their row and
            column dose-response fits (filled because missing, or replaced as outliers; listed under
            “Outliers and filled cells”). The observed response matrix shows that prediction there.
          </p>
        )}
      </Card>
      <Card title={<>Chou-Talalay combination index{issues.length > 0 && (
        <> <Chip tone="warn" title={issues.join("; ")}>Monotherapy fit poor: CIs unreliable</Chip></>
      )}</>}>
        <Grid caption="Median-effect fits" head={["Drug", "m (slope)", `Dm${unit}`, "r", "r²",
          "Used for the CIs?"]}
          rows={[["drug1", d1], ["drug2", d2]].map(([k, n]) => {
            const e = ct?.[k] as R | null;
            const used = !e ? "no (no median-effect line)" : e.valid === false
              ? `withheld: ${e.reason ?? "the fit does not meet the criteria"}` : e.valid === true ? "yes" : "n/a";
            return [n, e ? f(e.m) : "n/a", e ? f(e.Dm) : "n/a", e ? f(e.r) : "n/a",
              e && typeof e.r_squared === "number" ? f(e.r_squared, 3) : "n/a", used];
          })} />
        {typeof ct?.min_r_squared === "number" && (
          <p className="hint-block">
            A combination index is computed only when its Fa lies strictly between 0 and 1 and
            both median-effect fits are valid (slope m &gt; 0, r² ≥ {f(ct.min_r_squared, 3)}
            {typeof ct.min_points === "number" ? `, at least ${ct.min_points} doses` : ""});
            otherwise the table says why it is withheld
            {typeof ct.n_computed === "number" ? ` (${ct.n_computed} of ${(ct.combinations ?? []).length} computed)` : ""}.
          </p>
        )}
        {(issues.length > 0 || contradiction) && (
          <Note warn>
            {contradiction ? `${contradiction} ` : ""}
            {issues.length > 0 && `The combination indices below are unreliable: ${issues.join("; ")} (Chou 2010). `}
            {contradiction && issues.length > 0 && "Read the synergy scores and landscapes, which use the four-parameter fits, rather than these indices."}
          </Note>
        )}
        <Grid caption="Combination index per dose pair" head={[`${d1}${unit}`, `${d2}${unit}`, "Fa", "CI",
          `DRI ${d1}`, `DRI ${d2}`, "Interpretation"]}
        rows={((ct?.combinations ?? []) as R[]).map((c) => [formatSig(c.conc1), formatSig(c.conc2),
          f(c.fa, 3),
          c.ci == null && c.reason ? `withheld: ${c.reason}` : f(c.ci, 3),
          f(c.dri1, 3), f(c.dri2, 3),
          c.interpretation ?? (c.reason ? "n/a" : "n/a (Fa outside 0–1)")])} />
        <p className="hint-block">CI &lt; 1 synergism, = 1 additive, &gt; 1 antagonism, with Chou’s
          descriptive ranges; DRI is how many fold the dose of each drug can be reduced in the
          combination for the same effect.</p>
      </Card>
    </>
  );
}

export function SynergyMethods({ options, result }: ResultsProps<SynergyOptions, R>) {
  if (!result || result.error) return null;
  if (result.analysis === "synergy_multi") {
    const names = (result.drugs as string[]).join(", ");
    const text = `${options.responseKind === "viability" ? "Viability was converted to % inhibition (100 − viability). " : ""}`
      + `Combinations of ${result.n_drugs} drugs (${names}) were scored against highest single agent, Bliss `
      + `independence, Loewe additivity and zero interaction potency reference models for higher-order `
      + `combinations as defined in SynergyFinder Plus (Zheng et al. 2022), each drug alone fitted with a `
      + `four-parameter log-logistic model. Summary scores are the mean synergy over every combination of two `
      + `or more drugs and over combinations of all ${result.n_drugs} drugs, with SynergyFinder's P value `
      + `(Altman & Bland approximation of z = |mean|/SD). Analysis in OpenDose (open-source, built on SciPy).`;
    return <CopyableMethods text={text} />;
  }
  const shown = SYNERGY_MODELS.filter((m) => options.models[m]);
  const names: Record<SynergyModel, string> = {
    hsa: "highest single agent (HSA; Berenbaum 1989)",
    bliss: "Bliss independence (Bliss 1939)",
    loewe: "Loewe additivity (Loewe 1926)",
    zip: "zero interaction potency (ZIP; Yadav et al. 2015)",
  };
  const list = shown.map((m) => names[m]);
  const joined = list.length > 1 ? `${list.slice(0, -1).join(", ")} and ${list[list.length - 1]}` : list.join("");
  const reps = result.n_replicates > 1 ? ` Scores were computed for each of the ${result.n_replicates} replicate matrices and are reported as mean ± SD.` : "";
  const text = `${options.responseKind === "viability" ? "Viability was converted to % inhibition (100 − viability). " : ""}`
    + `Each drug alone was fitted with a four-parameter log-logistic model. Synergy was scored against `
    + `${joined} reference models as implemented in SynergyFinder (Ianevski et al. 2020); the summary score `
    + `is the mean synergy over the combination cells, with SynergyFinder's P value (Altman & Bland `
    + `approximation of z = |mean|/SD${result.n_replicates > 1 ? `, from ${result.p_value_basis ?? "resampled matrices"}` : ""}) `
    + `and most synergistic area (best 3 × 3 dose window). Relative IC50, relative inhibition (RI) and `
    + `the combination sensitivity score (CSS) were computed as defined by Malyutina et al. (2019).`
    + `${reps} Combination indices were computed by the `
    + `Chou-Talalay median-effect method (Chou 2010). `
    + (result.outliers ? `Cells more than ${result.outliers.threshold}% inhibition from the response predicted, `
      + `without the cell, by its row and column dose-response fits were ${result.outliers.action === "replace"
        ? "replaced by that prediction" : "flagged"} (${(result.outliers.cells ?? []).length} cell(s)). ` : "")
    + ((result.filled_cells ?? []).some((c: R) => c.reason === "missing")
      ? "Missing cells were filled with the response predicted by their row and column dose-response fits. " : "")
    + (result.musyc ? `Potency (α) and efficacy (β) synergy were estimated with MuSyC without cooperativity `
      + `(Meyer et al. 2019; Wooten et al. 2021), with 95% intervals from ${result.musyc.n_ci ?? 0} Monte Carlo refits. ` : "")
    + `Analysis in OpenDose (open-source, built on SciPy).`;
  return <CopyableMethods text={text} />;
}

