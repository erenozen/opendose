// Controls, results sheets and methods text for the nested t test and
// nested one-way ANOVA (mixed model: groups fixed, subcolumns random).
import "../common/sheetKit.css";
import type { ReactNode } from "react";
import CopyableMethods from "../common/CopyableMethods";
import { fmtCI, fmtP, formatSig, levelPct, stars } from "../common/statFormat";
import type { ControlsProps, ResultsProps } from "../types";
import {
  NESTED_COMPARISONS_LABELS, groupName,
  type NegativeVariance, type NestedAnovaOptions, type NestedComparisons,
  type NestedTOptions,
} from "./run";

/* eslint-disable @typescript-eslint/no-explicit-any */

const CI_LEVELS = [0.9, 0.95, 0.99];

function LevelSelect({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <label className="check-row">
      <span>Confidence level</span>
      <select value={value} onChange={(e) => onChange(Number(e.target.value))}>
        {CI_LEVELS.map((l) => <option key={l} value={l}>{levelPct(l)}</option>)}
      </select>
    </label>
  );
}

function NegVarSelect({ value, onChange }:
  { value: NegativeVariance; onChange: (v: NegativeVariance) => void }) {
  return (
    <label className="check-row">
      <span>Negative subcolumn variance</span>
      <select value={value} onChange={(e) => onChange(e.target.value as NegativeVariance)}>
        <option value="allow">Allow (matches a test of subcolumn means)</option>
        <option value="zero">Constrain to zero</option>
      </select>
    </label>
  );
}

function GroupSelect({ label, value, names, onChange }:
  { label: string; value: number; names: string[]; onChange: (v: number) => void }) {
  return (
    <label className="check-row">
      <span>{label}</span>
      <select value={Math.min(value, names.length - 1)}
        onChange={(e) => onChange(Number(e.target.value))}>
        {names.map((n, i) => <option key={i} value={i}>{n}</option>)}
      </select>
    </label>
  );
}

const LAYOUT_HINT = "Each data set column is one group; each of its subcolumns "
  + "is one subgroup (an animal, a dish, a herd), with that subgroup's "
  + "replicate values down the rows.";

export function NestedTControls({ table, options: o, onChange }: ControlsProps<NestedTOptions>) {
  const set = (patch: Partial<NestedTOptions>) => onChange({ ...o, ...patch });
  const names = table.datasets.map((_, d) => groupName(table, d));
  const a = names[Math.min(o.groupA, names.length - 1)] ?? "A";
  const b = names[Math.min(o.groupB, names.length - 1)] ?? "B";
  return (
    <div className="controls">
      <section>
        <h3>Compare</h3>
        {names.length > 2 ? (
          <>
            <GroupSelect label="Group A" value={o.groupA} names={names}
              onChange={(v) => set({ groupA: v })} />
            <GroupSelect label="Group B" value={o.groupB} names={names}
              onChange={(v) => set({ groupB: v })} />
          </>
        ) : <p className="hint-block">{a} vs. {b}</p>}
        <label className="check-row">
          <span>Report the difference as</span>
          <select value={o.swap ? "ab" : "ba"}
            onChange={(e) => set({ swap: e.target.value === "ab" })}>
            <option value="ba">{b} − {a}</option>
            <option value="ab">{a} − {b}</option>
          </select>
        </label>
      </section>
      <section>
        <h3>Options</h3>
        <LevelSelect value={o.ciLevel} onChange={(v) => set({ ciLevel: v })} />
        <NegVarSelect value={o.negativeVariance}
          onChange={(v) => set({ negativeVariance: v })} />
        <p className="hint-block">{LAYOUT_HINT}</p>
      </section>
    </div>
  );
}

export function NestedAnovaControls({ table, options: o, onChange }:
  ControlsProps<NestedAnovaOptions>) {
  const set = (patch: Partial<NestedAnovaOptions>) => onChange({ ...o, ...patch });
  const names = table.datasets.map((_, d) => groupName(table, d));
  return (
    <div className="controls">
      <section>
        <h3>Multiple comparisons</h3>
        <select aria-label="Multiple comparisons" value={o.comparisons}
          onChange={(e) => set({ comparisons: e.target.value as NestedComparisons })}>
          {(Object.keys(NESTED_COMPARISONS_LABELS) as NestedComparisons[]).map((k) => (
            <option key={k} value={k}>{NESTED_COMPARISONS_LABELS[k]}</option>
          ))}
        </select>
        {o.comparisons === "dunnett" && (
          <GroupSelect label="Control group" value={o.controlIndex} names={names}
            onChange={(v) => set({ controlIndex: v })} />
        )}
      </section>
      <section>
        <h3>Options</h3>
        <LevelSelect value={o.ciLevel} onChange={(v) => set({ ciLevel: v })} />
        <NegVarSelect value={o.negativeVariance}
          onChange={(v) => set({ negativeVariance: v })} />
        <p className="hint-block">{LAYOUT_HINT}</p>
      </section>
    </div>
  );
}

// ---------------------------------------------------------------- results

type Row = [string, ReactNode];

function KV({ rows }: { rows: Row[] }) {
  return (
    <table className="results-table goodness">
      <tbody>
        {rows.map(([k, v]) => <tr key={k}><th>{k}</th><td>{v}</td></tr>)}
      </tbody>
    </table>
  );
}

const minus = (s: string) => s.replace(" - ", " − ");

function TestBlock({ r }: { r: any }) {
  if (r.analysis === "nested_t_test") {
    return (
      <KV rows={[
        ["Comparison", minus(String(r.comparison))],
        ["P value (two-tailed)", `${fmtP(r.p)} ${stars(r.p)}`],
        ["Significantly different (P < 0.05)?", r.p < 0.05 ? "Yes" : "No"],
        ["t, df", `t = ${formatSig(r.t)}, df = ${r.df}`],
        ["F (DFn, DFd)", `F(${r.df_num}, ${r.df_den}) = ${formatSig(r.F)}`],
        ["Difference between means ± SEM",
          `${formatSig(r.difference)} ± ${formatSig(r.se_difference)}`],
        [`${levelPct(r.ci_level)} CI of difference`, fmtCI(r.ci)],
      ]} />
    );
  }
  return (
    <KV rows={[
      ["F (DFn, DFd)", `F(${r.df_num}, ${r.df_den}) = ${formatSig(r.F)}`],
      ["P value", `${fmtP(r.p)} ${stars(r.p)}`],
      ["Do the group means differ (P < 0.05)?", r.p < 0.05 ? "Yes" : "No"],
    ]} />
  );
}

export function NestedResults({ options, result: r }:
  ResultsProps<NestedTOptions | NestedAnovaOptions, Record<string, any>>) {
  if (!r) return null;
  if (r.error) return <div className="results-error">{String(r.error)}</div>;
  const isT = r.analysis === "nested_t_test";
  const level = levelPct(options.ciLevel);
  const re = r.random_effects;
  const among = re.among_subcolumns;
  const within = re.within_subcolumns;
  const sd = r.subcolumns_differ;
  const gof = r.goodness_of_fit;
  const tab = r.nested_anova_table;
  const mc = r.multiple_comparisons;
  const da = r.data_analyzed;
  return (
    <div className="result-card nested-results">
      <h3>{isT ? "Nested t test" : "Nested one-way ANOVA"}</h3>
      <p className="model-line">
        Mixed model: groups fixed, subcolumns (subgroups) random; REML fit,
        df by containment (subcolumns − groups). {da.n_treatments} groups,
        {" "}{da.n_subcolumns} subcolumns, {da.n_values} values.
      </p>
      <TestBlock r={r} />

      <h4>Group means</h4>
      <table className="results-table">
        <thead>
          <tr>
            <th scope="col">Group</th><th scope="col">Mean</th><th scope="col">SE</th>
            <th scope="col">{level} CI</th><th scope="col">Subcolumns</th>
            <th scope="col">Values</th>
          </tr>
        </thead>
        <tbody>
          {r.group_means.map((g: any) => (
            <tr key={g.name}>
              <th scope="row">{g.name}</th>
              <td>{formatSig(g.mean)}</td><td>{formatSig(g.se)}</td>
              <td>{fmtCI(g.ci)}</td><td>{g.n_subcolumns}</td><td>{g.n_values}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h4>Random effects</h4>
      <table className="results-table">
        <thead>
          <tr>
            <th scope="col">Source</th><th scope="col">SD</th>
            <th scope="col">Variance</th><th scope="col">% of total variance</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <th scope="row">Among subcolumns</th>
            <td>{among.sd != null ? formatSig(among.sd) : "n/a"}</td>
            <td>{formatSig(among.variance)}</td>
            <td>{among.percent_of_total != null ? `${formatSig(among.percent_of_total, 3)}%` : "n/a"}</td>
          </tr>
          <tr>
            <th scope="row">Within subcolumns (residual)</th>
            <td>{formatSig(within.sd)}</td>
            <td>{formatSig(within.variance)}</td>
            <td>{within.percent_of_total != null ? `${formatSig(within.percent_of_total, 3)}%` : "n/a"}</td>
          </tr>
        </tbody>
      </table>
      {among.variance < 0 && (
        <p className="result-note" role="note">
          The variance among subcolumns is estimated as negative: subcolumns
          vary less than their replicates would predict. It is kept, which
          makes the result equal to a test on the subcolumn means; choose
          &quot;Constrain to zero&quot; to bound it at zero instead.
        </p>
      )}

      <h4>Do the subcolumns differ?</h4>
      <KV rows={[
        ["Likelihood ratio χ², df", `${formatSig(sd.chi_square)}, ${sd.df}`],
        ["P value", `${fmtP(sd.p)} ${stars(sd.p)}`],
        ["Subcolumns differ (P < 0.05)?", sd.p < 0.05 ? "Yes" : "No"],
      ]} />

      {mc && (
        <>
          <h4>{NESTED_COMPARISONS_LABELS[mc.method as NestedComparisons]
            ?.replace(/ \(.*\)$/, "") ?? mc.method} multiple comparisons (df = {mc.df})</h4>
          <table className="results-table">
            <thead>
              <tr>
                <th scope="col">Comparison</th><th scope="col">Mean difference</th>
                <th scope="col">SE</th><th scope="col">{level} CI</th>
                <th scope="col">{mc.method === "tukey" ? "q" : "t"}</th>
                <th scope="col">Adjusted P</th><th scope="col">Summary</th>
              </tr>
            </thead>
            <tbody>
              {mc.comparisons.map((c: any) => (
                <tr key={c.pair}>
                  <th scope="row">{c.pair}</th>
                  <td>{formatSig(c.difference)}</td><td>{formatSig(c.se)}</td>
                  <td>{c.ci ? fmtCI(c.ci) : "n/a"}</td>
                  <td>{formatSig(c.statistic)}</td>
                  <td>{fmtP(c.p_adjusted)}</td><td>{stars(c.p_adjusted)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {mc.method === "holm_sidak" && (
            <p className="hint-block">Holm-Šídák is a step-down method, so it
              reports adjusted P values but no simultaneous confidence intervals.</p>
          )}
        </>
      )}

      <h4>Goodness of fit</h4>
      <KV rows={[
        ["Degrees of freedom", String(gof.df)],
        ["REML criterion", formatSig(gof.reml_criterion)],
        ["−2 log restricted likelihood", formatSig(gof.minus_2_log_restricted_likelihood)],
        ["AIC", formatSig(gof.aic)],
        ["BIC", formatSig(gof.bic)],
        ...(gof.converged ? [] : [["Converged", "No"] as Row]),
      ]} />

      <h4>Nested ANOVA table (hierarchical sums of squares)</h4>
      <table className="results-table">
        <thead>
          <tr>
            <th scope="col">Source of variation</th><th scope="col">SS</th>
            <th scope="col">DF</th><th scope="col">MS</th><th scope="col">F</th>
            <th scope="col">P value</th>
          </tr>
        </thead>
        <tbody>
          {([
            ["Between groups", tab.groups],
            ["Subgroups within groups", tab.subgroups_within_groups],
            ["Within subgroups (residual)", tab.within_subgroups],
          ] as [string, any][]).map(([name, s]) => (
            <tr key={name}>
              <th scope="row">{name}</th>
              <td>{formatSig(s.ss)}</td><td>{s.df}</td><td>{formatSig(s.ms)}</td>
              <td>{s.F != null ? formatSig(s.F) : ""}</td>
              <td>{s.p != null ? `${fmtP(s.p)} ${stars(s.p)}` : ""}</td>
            </tr>
          ))}
          <tr className="total-row">
            <th scope="row">Total</th>
            <td>{formatSig(tab.total.ss)}</td><td>{tab.total.df}</td>
            <td /><td /><td />
          </tr>
        </tbody>
      </table>
      <p className="hint-block">
        Groups are tested against subgroups, subgroups against the residual.
        This F for groups is exact only when every subcolumn has the same
        number of values; the mixed-model test above is the primary result.
      </p>

      <h4>Subgroups</h4>
      <table className="results-table">
        <thead>
          <tr>
            <th scope="col">Group</th><th scope="col">Subgroup</th><th scope="col">n</th>
            <th scope="col">Mean</th><th scope="col">SD</th><th scope="col">SEM</th>
          </tr>
        </thead>
        <tbody>
          {r.subgroup_summaries.map((s: any, i: number) => (
            <tr key={i}>
              <th scope="row">{s.group}</th><td>{s.subgroup}</td><td>{s.n}</td>
              <td>{formatSig(s.mean)}</td>
              <td>{s.sd != null ? formatSig(s.sd) : "n/a"}</td>
              <td>{s.sem != null ? formatSig(s.sem) : "n/a"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ------------------------------------------------------------ methods text

function pText(p: number): string {
  return p < 0.0001 ? "< 0.0001" : `= ${formatSig(p, 3)}`;
}

export function NestedMethods({ options, result: r }:
  ResultsProps<NestedTOptions | NestedAnovaOptions, Record<string, any>>) {
  if (!r || r.error || !r.group_means) return null;
  const isT = r.analysis === "nested_t_test";
  const da = r.data_analyzed;
  const parts: string[] = [];
  parts.push(`${isT ? "The two groups were compared by a nested t test"
    : `The ${da.n_treatments} groups were compared by a nested one-way ANOVA`}, `
    + "fitted as a linear mixed model with group as a fixed effect and "
    + "subgroups (subcolumns) nested within groups as a random effect, by "
    + "restricted maximum likelihood (REML), with denominator degrees of "
    + "freedom equal to the number of subgroups minus the number of groups"
    + (options.negativeVariance === "zero"
      ? " and the subgroup variance constrained to be non-negative" : ""));
  let text = parts.join("") + ` (${da.n_subcolumns} subgroups, ${da.n_values} values). `;
  if (isT) {
    text += `${minus(String(r.comparison))}: difference ${formatSig(r.difference)} `
      + `(${levelPct(r.ci_level)} CI ${fmtCI(r.ci)}), t(${r.df}) = ${formatSig(r.t)}, `
      + `P ${pText(r.p)}. `;
  } else {
    text += `F(${r.df_num}, ${r.df_den}) = ${formatSig(r.F)}, P ${pText(r.p)}. `;
    if (r.multiple_comparisons) {
      const m = NESTED_COMPARISONS_LABELS[r.multiple_comparisons.method as NestedComparisons]
        ?.replace(/ \(.*\)$/, "") ?? r.multiple_comparisons.method;
      text += `Group means were compared with ${m} multiple comparisons on the `
        + "model-estimated means. ";
    }
  }
  const pct = r.random_effects.among_subcolumns.percent_of_total;
  if (pct != null) {
    text += `Variation among subgroups accounted for ${formatSig(pct, 3)}% of the `
      + `total variance (likelihood ratio test that subgroups differ: `
      + `χ²(${r.subcolumns_differ.df}) = ${formatSig(r.subcolumns_differ.chi_square)}, `
      + `P ${pText(r.subcolumns_differ.p)}). `;
  }
  text += "Analyses were performed with OpenDose (open-source, built on SciPy).";
  return <CopyableMethods text={text} />;
}
