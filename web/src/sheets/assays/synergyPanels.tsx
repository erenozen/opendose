// Controls (with a matrix paste box), results and methods text of the
// drug-combination synergy analysis.
import { useState } from "react";
import { useProject } from "../../app/context";
import { updateTable } from "../../project/ops";
import { formatSig } from "../../types";
import CopyableMethods from "../common/CopyableMethods";
import type { ControlsProps, ResultsProps } from "../types";
import { Chip } from "./kit/ui";
import {
  MATRIX_VIEWS, MODEL_LABEL, MODEL_LONG, SYNERGY_MODELS, matricesFor, monotherapyIssues, parseMatrixBlocks,
  scoreReading, scoresVsCi, synergyTable, viewMatrix,
  type MatrixTableChoice, type SynergyColumns, type SynergyModel, type SynergyOptions,
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
        <TextIn label="Drug 1 (rows)" inputMode="text" value={o.drug1} onChange={(drug1) => set({ drug1 })} />
        <TextIn label="Drug 2 (columns)" inputMode="text" value={o.drug2} onChange={(drug2) => set({ drug2 })} />
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
      </section>
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

function Matrix({ title, m, c1, c2, sig = 3 }: { title: string; m: (number | null)[][]; c1: number[]; c2: number[]; sig?: number }) {
  return (
    <>
      <h4>{title}</h4>
      <Grid caption={title} head={["Drug 1 \\ Drug 2", ...c2.map((c) => formatSig(c))]}
        rows={m.map((row, i) => [formatSig(c1[i]), ...row.map((v) => (v === null ? "–" : formatSig(v, sig)))])} />
    </>
  );
}

export function SynergyResults({ options, result }: ResultsProps<SynergyOptions, R>) {
  const [view, setView] = useState<MatrixTableChoice>("default");
  if (!result) return null;
  if (result.error) return <Problem result={result} />;
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
  return (
    <>
      <Card title="Synergy scores">
        <Warnings list={result.warnings} />
        <Grid caption="Summary synergy scores" head={["Model", "Score", ...(reps > 1 ? ["SD over replicates"] : []), "Reading"]}
          rows={shown.map((m) => {
            const e = result.models[m] as R;
            return [`${MODEL_LABEL[m]} (${MODEL_LONG[m].toLowerCase()})`,
              <span className="assay-score" key={m}>{f(e.score)}</span>,
              ...(reps > 1 ? [f(e.score_sd)] : []), scoreReading(e.score)];
          })} />
        <p className="hint-block">
          Each score is the mean, over the combination cells, of observed minus
          expected % inhibition under that model’s definition of no interaction.
          Above 10: likely synergistic; −10 to 10: likely additive; below −10:
          likely antagonistic (SynergyFinder’s reading).
          {reps > 1 && ` The SD is over the ${reps} replicate matrices, each scored separately.`}
        </p>
        <h4>Monotherapy fits (four-parameter log-logistic, % inhibition)</h4>
        <Grid caption="Monotherapy fits" head={["Drug", "Bottom", "Top", `EC50${unit}`, "Hill slope", "R²"]}
          rows={[mono.drug1, mono.drug2].map((m: R, i) => [i ? d2 : d1,
            ...(m.fitted ? [f(m.params.Bottom), f(m.params.Top), f(m.params.EC50), f(m.params.HillSlope), f(m.r_squared)]
              : ["not fitted", "", "", "", ""])])} />
      </Card>
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
          return m ? <Matrix key={d.key} title={d.label} m={m} c1={c1} c2={c2} /> : null;
        })}
      </Card>
      <Card title={<>Chou-Talalay combination index{issues.length > 0 && (
        <> <Chip tone="warn" title={issues.join("; ")}>Monotherapy fit poor: CIs unreliable</Chip></>
      )}</>}>
        <Grid caption="Median-effect fits" head={["Drug", "m (slope)", `Dm${unit}`, "r"]}
          rows={[["drug1", d1], ["drug2", d2]].map(([k, n]) => {
            const e = ct?.[k] as R | null;
            return [n, e ? f(e.m) : "n/a", e ? f(e.Dm) : "n/a", e ? f(e.r) : "n/a"];
          })} />
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
          f(c.fa, 3), f(c.ci, 3), f(c.dri1, 3), f(c.dri2, 3), c.interpretation ?? "n/a (Fa outside 0–1)"])} />
        <p className="hint-block">CI &lt; 1 synergism, = 1 additive, &gt; 1 antagonism, with Chou’s
          descriptive ranges; DRI is how many fold the dose of each drug can be reduced in the
          combination for the same effect.</p>
      </Card>
    </>
  );
}

export function SynergyMethods({ options, result }: ResultsProps<SynergyOptions, R>) {
  if (!result || result.error) return null;
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
    + `is the mean synergy over the combination cells.${reps} Combination indices were computed by the `
    + `Chou-Talalay median-effect method (Chou 2010). Analysis in OpenDose (open-source, built on SciPy).`;
  return <CopyableMethods text={text} />;
}

