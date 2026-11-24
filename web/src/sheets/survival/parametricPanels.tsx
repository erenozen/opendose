// Parametric survival (P-91): the results sheet (distribution and
// percentiles chosen in place, the time ratios, the coefficients and
// scale, percentile survival times with their CIs and the Extrapolated
// flag, the model's fit and the AIC of each distribution) and the methods
// text. Wording and options in parametric.ts; every number comes from the
// engine.
import { useEffect, useId, useState } from "react";
import { Button, Field, Input, NumText } from "../../components/ui";
import { softwareSentence } from "../../export/cite";
import { getRuntimeVersions } from "../../lib/engine";
import { pLabel, tableP } from "../../report/pformat";
import { formatSig } from "../../types";
import { Grid, Note } from "../common/clinicalKit";
import CopyableMethods from "../common/CopyableMethods";
import TableCopy from "../common/TableCopy";
import type { ResultsProps } from "../types";
import { fmtTime } from "./entry";
import { Cite, Method } from "./extrasPanels";
import {
  bestByAic, DIST_LABEL, distWord, normalizeParametricOptions, parametricMethodsText, parametricWarnings,
  parsePercentiles, percentileLabel, percentilesText, type AftDist, type ParametricOptions,
} from "./parametric";
import { useOptionSetter } from "./useOptionSetter";
import "./survival.css";

/* eslint-disable @typescript-eslint/no-explicit-any */
type R = Record<string, any>;

const num = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const f = (v: unknown) => (num(v) ? formatSig(v) : "n/a");
const raw = (v: unknown) => (num(v) ? String(v) : "");
const ci = (c: unknown) => (Array.isArray(c) && num(c[0]) && num(c[1])
  ? `${formatSig(c[0])} to ${formatSig(c[1])}` : "n/a");

/** The percentiles field: commits on Enter or blur, says what to enter. */
function PercentilesField({ value, disabled, onCommit }: {
  value: number[]; disabled: boolean; onCommit: (p: number[]) => void;
}) {
  const [text, setText] = useState(percentilesText(value));
  useEffect(() => { setText(percentilesText(value)); }, [value]);
  const parsed = parsePercentiles(text);
  const commit = () => { if (parsed && percentilesText(parsed) !== percentilesText(value)) onCommit(parsed); };
  return (
    <Field label="Percentiles (% with the event)"
      error={parsed ? null : "Enter percents between 0 and 100, separated by commas"}>
      <Input value={text} disabled={disabled} inputMode="decimal"
        onChange={(e) => setText(e.target.value)} onBlur={commit}
        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); commit(); } }} />
    </Field>
  );
}

/** A time with its Extrapolated badge: a disclosure (DECISIONS 3) whose
 *  note opens under the table. */
function ExtrapolatedCell({ value, open, noteId, onToggle }: {
  value: string; open: boolean; noteId: string; onToggle: () => void;
}) {
  return (
    // the badge first, so the number stays on the column's right edge
    <span className="surv-extrap">
      <Button size="sm" className="result-badge badge-extrapolated" aria-expanded={open}
        aria-controls={noteId} onClick={onToggle}>Extrapolated</Button>
      <span>{value}</span>
    </span>
  );
}

export function ParametricResults({ sheet, options, result }: ResultsProps<unknown, R>) {
  const set = useOptionSetter<ParametricOptions>(sheet);
  const [openNote, setOpenNote] = useState<string | null>(null);
  const noteBase = useId();
  const o = normalizeParametricOptions(options);
  const controls = (
    <div className="surv-controls" role="group" aria-label="Model">
      <label className="check-row clin-field surv-field">
        <span>Distribution</span>
        <select aria-label="Distribution" value={o.dist} disabled={!set}
          onChange={(e) => set?.({ dist: e.target.value as AftDist })}>
          {(Object.keys(DIST_LABEL) as AftDist[]).map((d) => <option key={d} value={d}>{DIST_LABEL[d]}</option>)}
        </select>
      </label>
      <PercentilesField value={o.percentiles} disabled={!set} onCommit={(percentiles) => set?.({ percentiles })} />
    </div>
  );
  if (!result) return null;
  if (result.error) {
    return (
      <div className="result-card">
        <h3>Parametric survival model</h3>
        {controls}
        <div className="results-error">Parametric survival model failed: {String(result.error)}.</div>
      </div>
    );
  }
  const dist = DIST_LABEL[result.dist as AftDist] ?? String(result.dist);
  const level = `${Math.round(100 * (num(result.ci_level) ? result.ci_level : 0.95))}%`;
  const groups = (result.groups ?? []) as R[];
  const coefs = (result.coefficients ?? []) as R[];
  const ratios = (result.time_ratios ?? []) as R[];
  const scale = result.scale as R;
  const compare = (result.compare ?? []) as R[];
  const best = bestByAic(compare);
  const warnings = parametricWarnings(result).filter((w) => !/extrapolates beyond the data/.test(w));
  const unit = result.time_unit ? ` (${result.time_unit})` : "";
  const extrapolated = groups.flatMap((g) => (g.percentiles as R[]).map((p) => ({ g, p })))
    .find(({ g, p }) => p.beyond_follow_up && openNote === `${g.name}|${p.p}`);
  return (
    <div className="result-card">
      <h3>{dist} accelerated failure time model</h3>
      {controls}
      {warnings.length > 0 && (
        <div className="surv-notes">
          {warnings.map((w) => <Note key={w} warn><span role="note">{w}</span></Note>)}
        </div>
      )}
      {ratios.length > 0 && (
        <section className="surv-block" aria-label="Time ratios">
          <h4>Time ratios against {String(result.reference)}</h4>
          <Grid caption="Time ratios" head={["Group", "Time ratio", `${level} CI`, "P value"]}
            rows={ratios.map((r) => [`${r.group} vs. ${r.reference}`, f(r.value), ci(r.ci), tableP(r.p)])} />
          <Method>
            A time ratio of 2 means every percentile of survival time is twice as long in that group
            as in {String(result.reference)} (the model assumes the same ratio at every percentile).
          </Method>
        </section>
      )}
      <section className="surv-block" aria-label="Percentile survival times">
        <h4>Percentile survival times{unit}</h4>
        <TableCopy name="Percentile survival times" matrix={() => [
          ["Group", "Percent with the event", "Time", "SE", `Lower ${level} CI`, `Upper ${level} CI`,
            "Beyond last follow-up"],
          ...groups.flatMap((g) => (g.percentiles as R[]).map((p) => [String(g.name), String(p.p * 100),
            raw(p.time), raw(p.se), raw(p.ci?.[0]), raw(p.ci?.[1]), p.beyond_follow_up ? "yes" : "no"]))]} />
        <Grid caption="Percentile survival times"
          head={["Group", "Percentile", "Time", `${level} CI`, "Kaplan-Meier median"]}
          rows={groups.flatMap((g) => (g.percentiles as R[]).map((p) => [
            String(g.name), percentileLabel(p.p),
            p.beyond_follow_up
              ? <ExtrapolatedCell key="t" value={f(p.time)} noteId={`${noteBase}-note`}
                open={openNote === `${g.name}|${p.p}`}
                onToggle={() => setOpenNote(openNote === `${g.name}|${p.p}` ? null : `${g.name}|${p.p}`)} />
              : f(p.time),
            ci(p.ci),
            p.p === 0.5 ? (num(g.km_median) ? formatSig(g.km_median) : "not reached") : "",
          ]))} />
        {extrapolated && (
          <p id={`${noteBase}-note`} className="caveat-note caveat-extrapolated">
            <NumText text={`${extrapolated.g.name}, ${percentileLabel(extrapolated.p.p)}: ${f(extrapolated.p.time)} `
              + `is later than the last follow-up (${fmtTime(extrapolated.g.last_time)}). No subject was followed `
              + `that long, so the time comes from the shape of the ${distWord(String(result.dist))} model, not from observed `
              + "events."} />
          </p>
        )}
        <Method>
          The time by which the given percent of subjects have had the event, from the fitted model,
          with a delta-method CI on the log scale. The Kaplan-Meier median beside the model&apos;s median
          shows how well the {distWord(String(result.dist))} shape fits the data near 50%.{" "}
          <Cite>Collett 2015, Modelling Survival Data in Medical Research, 3rd ed., ch. 6</Cite>.
        </Method>
      </section>
      <section className="surv-block" aria-label="Coefficients">
        <h4>Coefficients (log time scale)</h4>
        <TableCopy name="Coefficients" matrix={() => [
          ["Term", "Estimate", "SE", "z", "P", `Lower ${level} CI`, `Upper ${level} CI`],
          ...coefs.map((c) => [String(c.name), raw(c.coef), raw(c.se), raw(c.z), raw(c.p), raw(c.ci?.[0]), raw(c.ci?.[1])]),
          ...(scale?.fixed ? [] : [["Log(scale)", raw(scale.log_value), raw(scale.log_se), "", "", "", ""]])]} />
        <Grid caption="Coefficients" head={["Term", "Estimate", "SE", "z", "P value", `${level} CI`]}
          rows={[...coefs.map((c) => [String(c.name), f(c.coef), f(c.se), f(c.z), tableP(c.p), ci(c.ci)]),
            ...(scale?.fixed ? [] : [["Log(scale)", f(scale.log_value), f(scale.log_se), "", "", ""]])]} />
        <Grid caption="Scale" className="surv-rmst-diff" head={["Parameter", "Value", `${level} CI`]}
          rows={[
            ["Scale σ", scale?.fixed ? "1 (fixed: exponential)" : f(scale?.value), scale?.fixed ? "" : ci(scale?.ci)],
            ...(num(result.shape) && !scale?.fixed
              ? [["Weibull shape (1 / σ)", f(result.shape), Array.isArray(scale?.ci)
                ? ci([1 / scale.ci[1], 1 / scale.ci[0]]) : "n/a"]] : []),
          ]} />
      </section>
      <section className="surv-block" aria-label="Model fit">
        <h4>Model fit</h4>
        <Grid caption="Model fit" head={["Measure", "Value"]} rows={[
          ["n (events)", `${result.n} (${result.n_events})`],
          ["Log-likelihood", f(result.loglik)],
          ...(result.lr_test ? [["Likelihood ratio test (vs. no group effect)",
            `χ² = ${f(result.lr_test.chi2)}, df ${result.lr_test.df}, ${pLabel(result.lr_test.p)}`]] : []),
          ["AIC", f(result.aic)],
        ]} />
        <Grid caption="AIC of each distribution" className="surv-rmst-diff"
          head={["Distribution", "Log-likelihood", "AIC", "Note"]}
          rows={compare.map((c) => [String(c.label), f(c.loglik), f(c.aic),
            c.dist === best ? "lowest AIC" : c.error ? String(c.error) : ""])} />
        <Method>
          Lower AIC is better; a difference under about 2 is too small to prefer one shape
          (<Cite>Burnham &amp; Anderson 2002, Model Selection and Multimodel Inference, 2nd ed.,
            section 2.6</Cite>). Choose the distribution before looking at the AIC where you can, and
          check it against the Kaplan-Meier curves.
        </Method>
      </section>
    </div>
  );
}

export function ParametricMethods({ result }: ResultsProps<unknown, R>) {
  return <CopyableMethods text={parametricMethodsText(result, softwareSentence(getRuntimeVersions()))} />;
}
