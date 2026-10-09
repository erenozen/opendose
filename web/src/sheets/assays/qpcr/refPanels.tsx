// The "Reference genes" block of the qPCR results (above the fold
// changes) and of the setup wizard's "Reference check" step: each
// reference gene's mean Cq per group with the shift against the
// calibrator, the test across groups, geNorm M, the SD of ΔCq between
// references, a chip per gene and one-click choices of the references
// (refs.ts holds the rules).
import { useEffect, useState } from "react";
import { runEngine } from "../../../lib/engine";
import type { DataTableModel } from "../../../project/types";
import { pLabel } from "../../../report/pformat";
import { formatSig } from "../../../types";
import { Chip } from "../kit/ui";
import { referenceGenes, runQpcr, type QpcrOptions } from "./model";
import {
  badInUse, REF_SOURCES, referenceActions, referenceChips, type RefAction,
} from "./refs";
import "./qpcr.css";

/* eslint-disable @typescript-eslint/no-explicit-any */

const n = (v: unknown, d?: number) => (typeof v === "number" && Number.isFinite(v) ? formatSig(v, d) : "");
const signed = (v: number) => `${v >= 0 ? "+" : "−"}${formatSig(Math.abs(v), 3)}`;

function testText(t: any): string {
  if (!t || t.p === null || t.p === undefined) return t?.note ? "not tested" : "n/a";
  const stat = typeof t.statistic === "number"
    ? (t.test === "one-way ANOVA" ? `F(${t.dfn}, ${t.dfd}) = ${formatSig(t.statistic, 4)}`
      : `H = ${formatSig(t.statistic, 4)}`) : "";
  return `${stat}${stat ? ", " : ""}${pLabel(t.p)}`;
}

export function RefCheck({ stab, used, onChoose, readOnly, calibrator }: {
  stab: any;
  used: string[];
  onChoose?: (a: RefAction, candidates: string[]) => void;
  readOnly?: boolean;
  calibrator?: string;
}) {
  if (!stab) return null;
  if (stab.error) {
    return (
      <section className="qpcr-refs" aria-label="Reference genes">
        <h4>Reference genes</h4>
        <p className="hint-block">Stability not computed: {String(stab.error)}</p>
      </section>
    );
  }
  const genes: any[] = stab.genes ?? [];
  const groups: string[] = genes[0]?.group_means?.map((g: any) => g.group) ?? [];
  const chips = referenceChips(stab);
  const bad = badInUse(stab, used);
  const actions = referenceActions(stab, used);
  const cands = genes.map((g) => String(g.gene));
  const t = stab.thresholds ?? {};
  return (
    <section className="qpcr-refs" aria-label="Reference genes">
      <h4>Reference genes</h4>
      <p className="model-line">
        Fold changes are normalised to {used.length > 1 ? `the geometric mean of ${used.join(" and ")}` : used[0]}.
        {" "}Checked first: does a reference move with treatment?
      </p>
      <div className="qpcr-ref-chips">
        {chips.map((c) => <Chip key={c.gene} tone={c.tone}>{c.text}</Chip>)}
      </div>
      {bad.length > 0 && (
        <div className="result-note result-note-warn" role="note">
          {bad.join(" and ")} {bad.length > 1 ? "are" : "is"} in use but {bad.length > 1 ? "shift" : "shifts"} with
          treatment or {bad.length > 1 ? "are" : "is"} not stable: every fold change normalised to it is biased by
          that shift.{actions.length ? " Choose another reference below." : " Add a validated reference gene."}
        </div>
      )}
      <div className="results-scroll">
        <table className="results-table qpcr-ref-table">
          <thead>
            <tr>
              <th scope="col">Gene</th>
              {groups.map((g) => (
                <th scope="col" key={g}>{g}{g === calibrator ? " (calibrator)" : ""}: mean Cq</th>
              ))}
              <th scope="col">Across groups (one-way ANOVA)</th>
              <th scope="col">geNorm M</th>
              <th scope="col">In use</th>
            </tr>
          </thead>
          <tbody>
            {genes.map((g) => (
              <tr key={g.gene} className={g.shifts_with_treatment || g.unstable ? "qc-row-fail" : ""}>
                <th scope="row">{g.gene}</th>
                {groups.map((grp) => {
                  const m = g.group_means?.find((x: any) => x.group === grp);
                  const s = g.shift_vs_calibrator?.find((x: any) => x.group === grp)?.shift;
                  return (
                    <td key={grp}>
                      {n(m?.mean_cq, 4)}
                      {typeof s === "number" && grp !== calibrator ? ` (${signed(s)})` : ""}
                      {m && m.n ? <span className="qpcr-ref-n"> n = {m.n}</span> : null}
                    </td>
                  );
                })}
                <td>{testText(g.group_test)}</td>
                <td>{g.M === null || g.M === undefined ? "n/a" : n(g.M, 3)}</td>
                <td>{used.includes(g.gene) ? "yes" : "no"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {(stab.pairs ?? []).map((p: any) => (
        <p key={`${p.gene_a}-${p.gene_b}`} className="hint-block">
          SD of ΔCq between {p.gene_a} and {p.gene_b}: {n(p.sd_dcq, 3)} (mean ΔCq {n(p.mean_dcq, 3)},
          {" "}{p.n} samples; a constant difference means the two move together).
        </p>
      ))}
      {onChoose && actions.length > 0 && (
        <div className="assay-setup qpcr-ref-actions">
          {actions.map((a) => (
            <button key={a.label} type="button" disabled={readOnly} onClick={() => onChoose(a, cands)}>
              {a.label}
            </button>
          ))}
        </div>
      )}
      <p className="hint-block qpcr-ref-source">
        A reference shifts with treatment when its Cq differs across groups (one-way ANOVA,
        P &lt; {t.alpha ?? 0.05}) by more than {t.shift_cq ?? 1} cycle (a 2-fold change at 100%
        efficiency); normalising to it moves every fold change by that shift. geNorm M above
        {" "}{t.m ?? 1.5} marks a gene as not stable (
        <a href={REF_SOURCES.genorm.url} target="_blank" rel="noreferrer">{REF_SOURCES.genorm.label}</a>);
        M is computed over all samples pooled, so genes that shift together can still have a low M, and
        with two genes both get the same M. MIQE 2.0 asks for reference genes validated in the
        experiment's own samples and conditions (
        <a href={REF_SOURCES.miqe.url} target="_blank" rel="noreferrer">{REF_SOURCES.miqe.label}</a>).
      </p>
    </section>
  );
}

/** The wizard's "Reference check" step: the draft run's stability block,
 *  with the one-click choices editing the draft. */
export function WizardRefCheck({ table, options, onChange }: {
  table: DataTableModel;
  options: QpcrOptions;
  onChange: (patch: Partial<QpcrOptions>) => void;
}) {
  const [state, setState] = useState<{ key: string; result: any } | null>(null);
  const key = JSON.stringify(options);
  useEffect(() => {
    let live = true;
    runEngine((engine) => runQpcr((p) => engine.analyze(p), table, options), { priority: "user" })
      .then((r) => { if (live) setState({ key, result: r }); },
        (e) => { if (live) setState({ key, result: { error: e instanceof Error ? e.message : String(e) } }); });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, table]);
  if (!state || state.key !== key) return <p className="hint-block" role="status">Checking the reference genes…</p>;
  const r = state.result;
  if (r?.error) return <p className="wizard-blocker">{String(r.error)}</p>;
  const used = (r?.reference_genes as string[] | undefined) ?? referenceGenes(options, []);
  return (
    <RefCheck stab={r?.reference_stability} used={used} calibrator={r?.calibrator}
      onChoose={(a, cands) => onChange({ referenceGenes: a.genes, referenceCandidates: cands })} />
  );
}
