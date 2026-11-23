// Reliability ICC (P-44): controls with a short explainer per form,
// results (all six forms, the chosen one first in the headline) and the
// methods text.
import { formatSig } from "../../types";
import { Card, Grid, KV, Note, Problem, Section, SOFTWARE, TextNum } from "../common/clinicalKit";
import CopyableMethods from "../common/CopyableMethods";
import { levelPct, pLabel } from "../common/statFormat";
import type { ControlsProps, ResultsProps } from "../types";
import {
  chosenForm, formName, ICC_FORMS, ICC_INFO, type IccForm, type IccOptions, type IccResult,
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
        <fieldset className="field-radios">
          <legend className="sr-only">ICC form</legend>
          {ICC_FORMS.map((k) => (
            <label key={k}>
              <input type="radio" name="icc-form" value={k} checked={options.form === k}
                onChange={() => set({ form: k as IccForm })} />
              <span>
                {ICC_INFO[k].name}: {ICC_INFO[k].model}
                {k === "ICC2" ? " (default)" : ""}
                <span className="field-note">{ICC_INFO[k].use}</span>
              </span>
            </label>
          ))}
        </fieldset>
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
    ICC_INFO[r.form].model.replace("mean of k raters", `mean of ${k} raters`),
    f(r.value), ciTxt(r.ci), `${f(r.F)} (${r.df1}, ${r.df2})`, pLabel(r.p),
  ]);
  return (
    <Card title={`Intraclass correlation: ${result.n_targets} targets, ${k} raters`}>
      <p className="hint-block">
        Raters: {result.names.join(", ")}. Each P value tests ICC = 0.
      </p>
      <Grid caption="Intraclass correlation coefficients"
        head={["Form", "Model", "ICC", `${lvl} CI`, "F (df1, df2)", "P value"]} rows={rows} />
      {(result.warnings ?? []).map((w) => <Note key={w} warn>{w}.</Note>)}
      {chosen && chosen.value < 0 && (
        <Note warn>{formName(chosen.form, k)} is negative: the ratings vary more within a target than between
          targets, so the raters show no reliability; report it as it is, not as 0.</Note>
      )}
      {result.n_targets < 5 && (
        <Note warn>Only {result.n_targets} targets: the confidence intervals are wide, so the ICC is estimated
          imprecisely.</Note>
      )}
      <div className="stat-cols">
        <KV title="Two-way ANOVA (targets × raters)" rows={[
          ["Mean square, targets", `${f(ms.between_targets)} (df ${result.df.targets})`],
          ["Mean square, raters", `${f(ms.between_raters)} (df ${result.df.raters})`],
          ["Mean square, residual", `${f(ms.residual)} (df ${result.df.residual})`],
          ["Mean square, within targets", `${f(ms.within_targets)} (df ${result.df.within})`],
          ...(result.raters_p != null ? [["Do the raters differ? (F test)",
            `F = ${f(result.raters_F)}, ${pLabel(result.raters_p)}`] as [string, string]] : []),
        ]} />
      </div>
      <p className="hint-block">
        Absolute agreement counts a rater who reads consistently high as disagreement; consistency
        ignores such an offset. The single-rater forms describe one rating; the k forms the mean of
        all {k}. If the raters differ (F test above), the absolute and consistency forms part ways.
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
