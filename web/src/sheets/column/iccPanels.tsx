// Reliability ICC (P-44): controls with a short explainer per form,
// results (all six forms, the chosen one first in the headline) and the
// methods text.
import { formatSig } from "../../types";
import { Card, Field, Grid, KV, Note, Problem, Section, SOFTWARE, TextNum } from "../common/clinicalKit";
import CopyableMethods from "../common/CopyableMethods";
import { levelPct, pLabel } from "../common/statFormat";
import type { ControlsProps, ResultsProps } from "../types";
import {
  chosenForm, DEFAULT_ICC_FORM, formName, ICC_FORMS, ICC_INFO, type IccForm, type IccOptions,
  type IccResult,
} from "./icc";

const f = (v: number | null | undefined) => formatSig(v ?? null);
const ciTxt = (c: [number, number] | null | undefined) => (c ? `${f(c[0])} to ${f(c[1])}` : "n/a");

export function IccControls({ options, onChange }: ControlsProps<IccOptions>) {
  const set = (p: Partial<IccOptions>) => onChange({ ...options, ...p });
  return (
    <div className="controls">
      <Section title="Agreement between raters (ICC)">
        <p className="hint-block">
          One column per rater (or instrument, or occasion) and one row per target, one rating
          per cell. All six intraclass correlations of Shrout &amp; Fleiss (1979) are reported with
          F-based confidence intervals (McGraw &amp; Wong 1996); the form chosen here leads the
          results.
        </p>
      </Section>
      <Section title="Form to report">
        <Field label="ICC form" note={ICC_INFO[options.form].use}>
          <select aria-label="ICC form" value={options.form}
            onChange={(e) => set({ form: e.target.value as IccForm })}>
            {ICC_FORMS.map((k) => (
              <option key={k} value={k}>
                {ICC_INFO[k].name}: {ICC_INFO[k].model}{k === DEFAULT_ICC_FORM ? " (default)" : ""}
              </option>
            ))}
          </select>
        </Field>
      </Section>
      <Section title="Output">
        <TextNum label="Confidence level (%)" value={options.ciLevel} onChange={(ciLevel) => set({ ciLevel })} />
      </Section>
    </div>
  );
}

export function IccResults({ result }: ResultsProps<IccOptions, IccResult>) {
  if (!result) return null;
  if (result.error) return <Problem error={result.error} />;
  const lvl = levelPct(result.ci_level);
  const k = result.k_raters;
  const chosen = chosenForm(result);
  const ms = result.mean_squares;
  const rows = result.forms.map((r) => [
    `${formName(r.form, k)}${r.form === result.options.form ? " (chosen)" : ""}`,
    f(r.value), ciTxt(r.ci),
  ]);
  // two F tests of ICC = 0: one for the one-way forms, one for the two-way forms
  const ftest = (form: IccForm) => {
    const r = result.forms.find((x) => x.form === form);
    return r ? `F(${r.df1}, ${r.df2}) = ${f(r.F)}, ${pLabel(r.p)}` : "n/a";
  };
  return (
    <Card title={`Intraclass correlation: ${result.n_targets} targets, ${k} raters`}>
      <p className="hint-block">
        Raters: {result.names.join(", ")}.
      </p>
      <Grid caption="Intraclass correlation coefficients"
        head={["Form", "ICC", `${lvl} CI`]} rows={rows} />
      <p className="hint-block">
        ICC(1,·): one-way random effects. ICC(2,·): two-way random effects, absolute agreement.
        ICC(3,·): two-way mixed effects, consistency. ICC(·,1) is the reliability of a single
        rater&apos;s rating, ICC(·,{k}) of the mean of the {k} raters (Shrout &amp; Fleiss 1979).
      </p>
      {(result.warnings ?? []).map((w) => <Note key={w} warn>{w}.</Note>)}
      {chosen && chosen.value < 0 && (
        <Note warn>{formName(chosen.form, k)} is negative: the ratings vary more within a target than
          between targets.</Note>
      )}
      <KV className="kv-wide" title="Tests of ICC = 0" rows={[
        ["One-way forms", ftest("ICC1")],
        ["Two-way forms", ftest("ICC3")],
      ]} />
      <KV className="kv-wide" title="Two-way ANOVA (targets × raters)" rows={[
        ["Mean square, targets", `${f(ms.between_targets)} (df ${result.df.targets})`],
        ["Mean square, raters", `${f(ms.between_raters)} (df ${result.df.raters})`],
        ["Mean square, residual", `${f(ms.residual)} (df ${result.df.residual})`],
        ["Mean square, within targets", `${f(ms.within_targets)} (df ${result.df.within})`],
        ...(result.raters_p != null ? [["Do the raters differ? (F test)",
          `F = ${f(result.raters_F)}, ${pLabel(result.raters_p)}`] as [string, string]] : []),
      ]} />
      <p className="hint-block">
        Absolute agreement counts a rater who reads consistently high as disagreement; consistency
        ignores such an offset. If the raters differ (F test above), the two part ways.
      </p>
    </Card>
  );
}

export function IccMethods({ result }: ResultsProps<IccOptions, IccResult>) {
  if (!result || result.error) return null;
  const c = chosenForm(result);
  if (!c) return null;
  const lvl = levelPct(result.ci_level);
  const text = `Agreement between ${result.k_raters} raters on ${result.n_targets} targets was measured by the `
    + `intraclass correlation coefficient ${formName(c.form, result.k_raters)} (${ICC_INFO[c.form].model.toLowerCase()
      .replace("mean of k raters", `mean of ${result.k_raters} raters`)}; Shrout & Fleiss 1979; McGraw & Wong 1996), `
    + `using ${SOFTWARE}: ICC = ${f(c.value)} (${lvl} CI ${ciTxt(c.ci)}, F-based), F(${c.df1}, ${c.df2}) = ${f(c.F)}, ${pLabel(c.p)}.`;
  return <CopyableMethods text={text} />;
}
