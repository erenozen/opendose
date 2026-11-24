// Parameter panel, results sheet and methods text of the baseline-adjusted
// comparison (ANCOVA, P-82). Model and payload: ./ancova.ts.
import type { ControlsProps, ResultsProps } from "../types";
import { variableInfo } from "./model";
import { CiField, Field, Section } from "./controls";
import { Card, Grid, KV, Methods, Problem } from "./results";
import { TOOL, ci, f, fmtP, list, lvl, summaryStars } from "./resultFormat";
import { ROW_TITLES, groupLevels, type AncovaOptions, type AncovaResult } from "./ancova";
import { pLabel } from "../../report/pformat";

export function AncovaControls({ table, options, onChange }: ControlsProps<AncovaOptions>) {
  const set = (p: Partial<AncovaOptions>) => onChange({ ...options, ...p });
  const info = variableInfo(table);
  const numeric = info.filter((v) => v.kind === "continuous");
  const levels = groupLevels(table, options.group);
  const pick = (label: string, aria: string, value: string, vars: { name: string }[],
    onPick: (v: string) => void) => (
    <Field label={label}>
      <select aria-label={aria} value={vars.some((v) => v.name === value) ? value : ""}
        onChange={(e) => onPick(e.target.value)}>
        <option value="">Choose…</option>
        {vars.map((v) => <option key={v.name} value={v.name}>{v.name}</option>)}
      </select>
    </Field>
  );
  return (
    <div className="controls">
      <Section title="Variables">
        {pick("Follow-up (outcome)", "Follow-up variable", options.outcome,
          numeric.filter((v) => v.name !== options.baseline), (outcome) => set({ outcome }))}
        {pick("Baseline", "Baseline variable", options.baseline,
          numeric.filter((v) => v.name !== options.outcome), (baseline) => set({ baseline }))}
        {pick("Group", "Group variable", options.group,
          [...info.filter((v) => v.name !== options.outcome && v.name !== options.baseline),
            ...(table.rowTitles.some((x) => x.trim()) ? [{ name: ROW_TITLES }] : [])],
          (group) => set({ group, referenceLevel: "" }))}
        <p className="hint-block">
          One row per subject: its group, the value measured before treatment and the value
          measured after. The follow-up is compared between groups adjusted for the baseline.
        </p>
      </Section>
      {levels.length > 1 && (
        <Section title="Comparison">
          <Field label="Compare against" note="Each other group's adjusted difference is against this one.">
            <select aria-label="Reference group" value={levels.includes(options.referenceLevel)
              ? options.referenceLevel : levels[0]}
            onChange={(e) => set({ referenceLevel: e.target.value })}>
              {levels.map((l) => <option key={l} value={l}>{l}</option>)}
            </select>
          </Field>
        </Section>
      )}
      <Section title="Options">
        <CiField value={options.ciLevel} onChange={(ciLevel) => set({ ciLevel })} />
      </Section>
    </div>
  );
}

export function AncovaResults({ result }: ResultsProps<AncovaOptions, AncovaResult>) {
  if (!result) return null;
  if (result.error) return <Problem result={result} />;
  const L = lvl(result.ci_level);
  const es = result.equal_slopes;
  const s = result.baseline_slope;
  return (
    <Card title={`Baseline-adjusted comparison (ANCOVA) of ${result.outcome}`}>
      {result.warnings.map((w) => <p key={w} className="result-note">{w}</p>)}
      <p className="hint-block">
        {result.outcome} = β0 + group effect + β·{result.baseline}, one slope for every group.
        {" "}{result.n_rows_analyzed} subjects analyzed, {result.n_rows_skipped} skipped.
      </p>
      <h4>Adjusted difference</h4>
      <Grid caption="Adjusted differences"
        head={["Comparison", "Adjusted difference", "SE", `${L} CI`, "|t|", "df", "P value", ""]}
        rows={result.differences.map((d) => [
          `${d.level} − ${d.vs}`, f(d.estimate), f(d.se), ci(d.ci), f(d.t), String(d.df),
          fmtP(d.p), summaryStars(d.p)])} />
      <p className="hint-block">
        The difference in {result.outcome} between subjects with the same {result.baseline}.
        {result.differences.length > 1 && " Each group against the reference group; P values not "
          + "corrected for multiple comparisons."}
      </p>
      <h4>Adjusted means</h4>
      <Grid caption="Adjusted means"
        head={["Group", "n", "Adjusted mean", "SE", `${L} CI`]}
        rows={result.adjusted_means.map((m) => [m.level, String(m.n), f(m.mean), f(m.se), ci(m.ci)])} />
      <p className="hint-block">
        Each group's predicted {result.outcome} at the mean {result.baseline} of all subjects
        ({f(result.baseline_mean)}).
      </p>
      <h4>Unadjusted means</h4>
      <Grid caption="Unadjusted means"
        head={["Group", "n", `Mean ${result.baseline}`, `Mean ${result.outcome}`, `SD ${result.outcome}`]}
        rows={result.unadjusted.map((u) => [u.level, String(u.n), f(u.baseline_mean), f(u.outcome_mean),
          f(u.outcome_sd)])} />
      <h4>ANOVA table (type III)</h4>
      <Grid caption="Type III ANOVA table"
        head={["Source", "SS", "df", "MS", "F", "P value", ""]}
        rows={result.anova.map((a) => [a.source, f(a.ss), String(a.df), f(a.ms),
          a.F === undefined ? "" : f(a.F), a.p === undefined ? "" : fmtP(a.p),
          a.p === undefined ? "" : summaryStars(a.p)])} />
      <div className="stat-cols">
        <KV title={`Slope of ${result.baseline}`} rows={[
          ["Slope", f(s.estimate)],
          ["SE", f(s.se)],
          [`${L} CI`, ci(s.ci)],
          ["P value", `${fmtP(s.p)} ${summaryStars(s.p)}`],
        ]} />
        <KV title={`Equal slopes (group × ${result.baseline})`} rows={"error" in es
          ? [["Test", `not computed: ${es.error}`]]
          : [
            ["F", f(es.F)],
            ["Degrees of freedom", `${es.df1}, ${es.df2}`],
            ["P value", fmtP(es.p)],
            ...es.slopes.map((x): [string, string] => [`Slope in ${x.level}`, `${f(x.slope)} (SE ${f(x.se)})`]),
          ]} />
        <KV title="Goodness of fit" rows={[
          ["R squared", f(result.goodness.r_squared)],
          ["Adjusted R squared", f(result.goodness.adjusted_r_squared)],
          ["Sy.x", f(result.goodness.sy_x)],
          ["Residual df", String(result.goodness.df)],
        ]} />
      </div>
      <p className="hint-block">
        With a baseline measurement, comparing the follow-up adjusted for the baseline has more power than
        comparing the follow-up alone or the change from baseline, and it corrects for chance imbalance at
        baseline (Vickers &amp; Altman 2001, BMJ 323:1123). The equal-slopes test asks whether the follow-up
        rises with the baseline at the same rate in every group, as the model assumes.
      </p>
    </Card>
  );
}

export function AncovaMethods({ result }: ResultsProps<AncovaOptions, AncovaResult>) {
  if (!result || result.error) return null;
  const L = lvl(result.ci_level);
  const diffs = result.differences.map((d) =>
    `${d.level} vs ${d.vs}: adjusted difference ${f(d.estimate)} (${L} CI ${ci(d.ci)}; ${pLabel(d.p)})`);
  const es = result.equal_slopes;
  const slopes = "error" in es ? ""
    : ` The group × ${result.baseline} interaction (test of equal slopes) gave F(${es.df1}, ${es.df2}) = `
      + `${f(es.F)}, ${pLabel(es.p)}.`;
  return <Methods text={`${result.outcome} was compared between ${list(result.levels)} by analysis of `
    + `covariance (ANCOVA) with ${result.baseline} as the covariate (least squares, one slope for all `
    + `groups; Vickers & Altman 2001), using ${TOOL} (${result.n_rows_analyzed} subjects with complete `
    + `data). Adjusted means were evaluated at the mean ${result.baseline} (${f(result.baseline_mean)}). `
    + `${diffs.join("; ")}.${slopes}`} />;
}
