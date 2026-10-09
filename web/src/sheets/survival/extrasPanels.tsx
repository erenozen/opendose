// Results blocks of the survival analysis' extras (survival/extras.ts):
// the "median not reached" explanation and the engine's warnings under
// the medians; the pairwise log-rank table with its correction and the
// log-rank test for trend; survival at a chosen time; the restricted mean
// survival time. Options are edited in place and stored on the results
// sheet (updateResultsOptions), so frozen and shared sheets show them
// read-only.
import { useEffect, useState, type ReactNode } from "react";
import { useProject } from "../../app/context";
import { softwareSentence } from "../../export/cite";
import { SRC } from "../../guide/sources";
import { getRuntimeVersions } from "../../lib/engine";
import { updateResultsOptions } from "../../project/ops";
import type { DataTableModel } from "../../project/types";
import { pLabel, tableP } from "../../report/pformat";
import { formatSig } from "../../types";
import { Check, Grid, Note, Problem } from "../common/clinicalKit";
import CopyableMethods from "../common/CopyableMethods";
import TableCopy from "../common/TableCopy";
import type { ResultsProps } from "../types";
import { fmtTime, timeUnitOf } from "./entry";
import {
  adjustedHeader, atTimeLabel, CORRECTION_LABEL, lastCommonTime, normalizeSurvivalOptions,
  survivalMethodsText, survivalWarnings, type PairwiseCorrection,
  type SurvivalExtras, type SurvivalOptions,
} from "./extras";
import "./survival.css";

/* eslint-disable @typescript-eslint/no-explicit-any */
type R = Record<string, any>;

const num = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const f = (v: unknown) => (num(v) ? formatSig(v) : "n/a");
const ci = (c: unknown) => (Array.isArray(c) && num(c[0]) && num(c[1])
  ? `${formatSig(c[0])} to ${formatSig(c[1])}` : "n/a");
const pctOf = (v: unknown) => (num(v) ? `${formatSig(v * 100)}%` : "n/a");
const raw = (v: unknown) => (num(v) ? String(v) : "");

/** A cited source: a link for a verified URL, else the reference in words. */
function Cite({ children, href }: { children: ReactNode; href?: string }) {
  return href
    ? <a href={href} target="_blank" rel="noreferrer">{children}</a>
    : <cite>{children}</cite>;
}

function Method({ children }: { children: ReactNode }) {
  return <p className="hint-block surv-method">{children}</p>;
}

/** Edit this results sheet's options (null when it is locked). */
function useOptionSetter(sheet: ResultsProps["sheet"]):
  ((patch: Partial<SurvivalOptions>, key?: string) => void) | null {
  const api = useProject();
  if (sheet.frozen || api.readOnly) return null;
  return (patch, key) => {
    api.apply((p) => updateResultsOptions(p, sheet.id,
      (o) => ({ ...(o && typeof o === "object" ? o : {}), ...patch })), key ? `surv:${sheet.id}:${key}` : null);
  };
}

/** A number field that commits on Enter or when it loses focus (each
 *  commit runs the engine); empty = the default. */
function CommitNumber({ label, value, placeholder, onCommit, disabled, note }: {
  label: string; value: number | null; placeholder: string;
  onCommit: (v: number | null) => void; disabled?: boolean; note?: ReactNode;
}) {
  const [text, setText] = useState(value === null ? "" : String(value));
  useEffect(() => { setText(value === null ? "" : String(value)); }, [value]);
  const commit = () => {
    const s = text.trim().replace(",", ".");
    if (!s) { if (value !== null) onCommit(null); return; }
    const v = Number(s);
    if (Number.isFinite(v) && v >= 0 && v !== value) onCommit(v);
    else if (!Number.isFinite(v) || v < 0) setText(value === null ? "" : String(value));
  };
  return (
    <label className="check-row clin-field surv-field">
      <span>{label}</span>
      <input className="constraint-value" inputMode="decimal" aria-label={label} value={text}
        placeholder={placeholder} disabled={disabled} style={{ width: 96 }}
        onChange={(e) => setText(e.target.value)} onBlur={commit}
        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); commit(); } }} />
      {note && <span className="field-note">{note}</span>}
    </label>
  );
}

// ------------------------------------------------------------ under the medians

/** "Median not reached" explained, and the engine's warnings (few events,
 *  rows left out). */
export function MedianNotes({ result, table }: { result: R | null; table: DataTableModel }) {
  if (!result || result.error) return null;
  const ex = (result.extras ?? {}) as SurvivalExtras;
  const unit = timeUnitOf(table);
  const groups = (Array.isArray(ex.at_time?.groups) ? ex.at_time.groups : []) as R[];
  const notReached = groups.filter((g) => g.explanation?.median_reached === false);
  const warnings = survivalWarnings(result);
  if (!notReached.length && !warnings.length) return null;
  return (
    <div className="surv-notes">
      {notReached.length > 0 && (
        <Note>
          <strong>Median not reached</strong> for {notReached.map((g) => g.name).join(", ")}: the
          Kaplan-Meier curve stayed above 50% to the end of follow-up ({notReached.map((g) =>
            `${g.name}: ${pctOf(g.explanation.fraction_at_last)} event-free at ${atTimeLabel(g.explanation.last_time, unit)}`)
            .join("; ")}), so more than half the subjects never had the event while they were
          followed and the median survival time is not known, only that it is later. Survival at
          a fixed time and the restricted mean survival time below describe these groups instead.{" "}
          <Cite href={SRC.gpMedianSurvival.url}>{SRC.gpMedianSurvival.label}</Cite>
        </Note>
      )}
      {warnings.map((w) => <Note key={w} warn><span role="note">{w}</span></Note>)}
      {warnings.some((w) => /few events|events in total/i.test(w)) && (
        <p className="hint-block surv-method">
          Few-events rule: fewer than 10 events in all, or fewer than 5 in a group (Machin, Cheung
          &amp; Parmar 2006, Survival Analysis: A Practical Approach; Collett 2015, ch. 2).
        </p>
      )}
    </div>
  );
}

// ------------------------------------------------------------ pairwise

function PairwiseBlock({ result, options, set }: {
  result: R; options: SurvivalOptions;
  set: ((patch: Partial<SurvivalOptions>, key?: string) => void) | null;
}) {
  const pw = (result.extras as SurvivalExtras | undefined)?.pairwise;
  const names = Object.keys(result.curves ?? {});
  if (names.length < 3 || !pw) return null;
  const rows = (Array.isArray(pw.comparisons) ? pw.comparisons : []) as R[];
  const k = num(pw.family_size) ? pw.family_size : rows.length;
  const control = names.includes(options.pairwiseControl) ? options.pairwiseControl : names[0];
  const head = ["Comparison", "χ²", "df", "P (unadjusted)", `P (adjusted, ${CORRECTION_LABEL[options.pairwiseCorrection]})`,
    "Hazard ratio (95% CI)", "Significant (adjusted P < 0.05)"];
  const matrix = () => [
    ["Comparison", "Chi-square", "df", "P unadjusted", "P adjusted", "Hazard ratio", "HR lower", "HR upper"],
    ...rows.map((r) => [`${r.a} vs. ${r.b}`, raw(r.chi2), String(r.df ?? 1), raw(r.p_unadjusted),
      raw(r.p_adjusted), raw(r.hr), raw(r.hr_ci?.[0]), raw(r.hr_ci?.[1])]),
  ];
  const trend = pw.trend as R | null;
  return (
    <section className="surv-block" aria-label="Pairwise comparisons">
      <h4>Pairwise comparisons (log-rank)</h4>
      <div className="surv-controls">
        <label className="check-row clin-field surv-field">
          <span>Compare</span>
          <select aria-label="Compare groups" value={options.pairwiseFamily} disabled={!set}
            onChange={(e) => set?.({ pairwiseFamily: e.target.value === "control" ? "control" : "all" })}>
            <option value="all">All pairs</option>
            <option value="control">Each group with a control</option>
          </select>
        </label>
        {options.pairwiseFamily === "control" && (
          <label className="check-row clin-field surv-field">
            <span>Control group</span>
            <select aria-label="Control group" value={control} disabled={!set}
              onChange={(e) => set?.({ pairwiseControl: e.target.value })}>
              {names.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
        )}
        <label className="check-row clin-field surv-field">
          <span>Correction</span>
          <select aria-label="Multiple comparisons correction" value={options.pairwiseCorrection}
            disabled={!set}
            onChange={(e) => set?.({ pairwiseCorrection: e.target.value as PairwiseCorrection })}>
            <option value="holm_sidak">Holm-Šídák (default)</option>
            <option value="bonferroni">Bonferroni</option>
            <option value="none">None (not adjusted)</option>
          </select>
        </label>
      </div>
      {pw.error ? <Problem error={`Pairwise comparisons failed: ${String(pw.error)}`} /> : (
        <>
          <p className="surv-family" role="note">
            {pw.family?.label ? `${String(pw.family.label).replace(/^./, (c) => c.toUpperCase())}. ` : ""}
            P values {adjustedHeader(k, String(pw.correction ?? options.pairwiseCorrection))}.
          </p>
          <TableCopy name="Pairwise log-rank comparisons" matrix={matrix} />
          <Grid head={head} caption="Pairwise log-rank comparisons"
            rows={rows.map((r) => [
              `${r.a} vs. ${r.b}`, f(r.chi2), String(r.df ?? 1), tableP(r.p_unadjusted),
              tableP(r.p_adjusted),
              num(r.hr) ? `${formatSig(r.hr)} (${ci(r.hr_ci)})` : "n/a",
              r.p_adjusted == null ? "n/a" : r.significant_05 ? "Yes" : "No",
            ])} />
          <Method>
            Each pair of groups is analysed by its own two-group log-rank test (Peto form, as the
            overall test above; only those two groups' subjects), then the P values are adjusted
            for the {k} comparisons of the family
            {options.pairwiseCorrection === "holm_sidak" ? " by the Holm-Šídák step-down method"
              : options.pairwiseCorrection === "bonferroni" ? " by Bonferroni (P × " + k + ")" : " (here: not adjusted)"}.
            The hazard ratio (Mantel-Haenszel) is of the first group relative to the second, its CI
            not adjusted. Sources: GraphPad Statistics Guide, “Multiple comparisons of survival
            curves”; Holm (1979) Scand J Statist 6:65–70;{" "}
            <Cite href={SRC.gpAdjustedP.url}>{SRC.gpAdjustedP.label}</Cite>.
          </Method>
          <Check label="Groups are ordered (e.g. doses): log-rank test for trend"
            checked={options.trend} disabled={!set} onChange={(trend) => set?.({ trend })} />
          {options.trend && trend && (
            <div className="surv-trend">
              <table className="results-table goodness">
                <tbody>
                  <tr>
                    <th scope="row">Log-rank test for trend</th>
                    <td>χ² = {f(trend.chi2)}, df {trend.df ?? 1}, {pLabel(trend.p)}</td>
                  </tr>
                </tbody>
              </table>
              <Method>
                The test for trend asks whether survival rises or falls steadily with the order of
                the groups (scores {(trend.scores as number[] ?? []).map(fmtTime).join(", ")} for{" "}
                {(trend.group_names as string[] ?? names).join(", ")}, in table order), one test
                on 1 df, rather than whether any curves differ; put the groups in dose order. Sources:
                GraphPad Statistics Guide, “Log-rank test for trend”; Collett (2015) Modelling
                Survival Data in Medical Research, 3rd ed., ch. 2.
              </Method>
            </div>
          )}
        </>
      )}
    </section>
  );
}

// ------------------------------------------------------------ survival at a time

function AtTimeBlock({ result, table, options, set }: {
  result: R; table: DataTableModel; options: SurvivalOptions;
  set: ((patch: Partial<SurvivalOptions>, key?: string) => void) | null;
}) {
  const ex = (result.extras ?? {}) as SurvivalExtras;
  const at = ex.at_time;
  const unit = timeUnitOf(table);
  const def = lastCommonTime(table);
  const t = ex.at_time_used;
  if (!at || t == null) return null;
  const groups = (Array.isArray(at.groups) ? at.groups : []) as R[];
  const level = `${Math.round(100 * (num(at.ci_level) ? at.ci_level : 0.95))}%`;
  const rowsAt = groups.map((g) => ({ g, a: (g.at_times ?? [])[0] as R | undefined }));
  const twoDiff = rowsAt.length === 2 && rowsAt.every((r) => num(r.a?.survival));
  const matrix = () => [
    ["Group", "n", "Time", "Survival", "SE", `Lower ${level} CI`, `Upper ${level} CI`, "At risk", "Events so far"],
    ...rowsAt.map(({ g, a }) => [String(g.name), String(g.n), raw(a?.time), raw(a?.survival), raw(a?.se),
      raw(a?.ci_loglog?.[0]), raw(a?.ci_loglog?.[1]), raw(a?.at_risk), raw(a?.events_so_far)]),
  ];
  return (
    <section className="surv-block" aria-label="Survival at a chosen time">
      <h4>Survival at {atTimeLabel(t, unit)}</h4>
      <div className="surv-controls">
        <CommitNumber label="Survival at time" value={options.survivalAt} disabled={!set}
          placeholder={def === null ? "" : fmtTime(def)}
          onCommit={(survivalAt) => set?.({ survivalAt })}
          note={ex.at_time_default && def !== null
            ? `Default: ${atTimeLabel(def, unit)}, the last time every group was still followed.` : undefined} />
      </div>
      {at.error ? <Problem error={`Survival at ${atTimeLabel(t, unit)}: ${String(at.error)}`} /> : (
        <>
          <TableCopy name={`Survival at ${atTimeLabel(t, unit)}`} matrix={matrix} />
          <Grid caption={`Survival at ${atTimeLabel(t, unit)}`}
            head={["Group", "n", "Survival", `${level} CI (log-log)`, "SE (Greenwood)", "At risk", "Events so far"]}
            rows={rowsAt.map(({ g, a }) => [
              String(g.name), String(g.n),
              a?.beyond_last ? "not estimated" : pctOf(a?.survival),
              a?.beyond_last ? "n/a" : Array.isArray(a?.ci_loglog)
                ? `${pctOf(a.ci_loglog[0])} to ${pctOf(a.ci_loglog[1])}` : "n/a",
              num(a?.se) ? `${formatSig(a.se * 100)} points` : "n/a",
              raw(a?.at_risk), raw(a?.events_so_far),
            ])} />
          {rowsAt.filter(({ a }) => a?.beyond_last).map(({ g, a }) => (
            <p key={g.name} className="hint-block">{g.name}: {String(a?.note ?? "after the last observed time")}.</p>
          ))}
          {twoDiff && (
            <p className="surv-diff">
              Difference ({rowsAt[1].g.name} minus {rowsAt[0].g.name}):{" "}
              {formatSig((rowsAt[1].a!.survival - rowsAt[0].a!.survival) * 100)} percentage points
              (no CI: compare the curves with the log-rank test or the RMST below).
            </p>
          )}
          <Method>
            Kaplan-Meier estimate at {atTimeLabel(t, unit)} (including events at that time), Greenwood
            standard error and {level} confidence interval on the log-log scale, as R&apos;s
            summary.survfit; not estimated after a group&apos;s last observed time.{" "}
            <Cite href={SRC.gpMedianSurvival.url}>{SRC.gpMedianSurvival.label}</Cite>.
          </Method>
        </>
      )}
    </section>
  );
}

// ------------------------------------------------------------ RMST

function RmstBlock({ result, table, options, set }: {
  result: R; table: DataTableModel; options: SurvivalOptions;
  set: ((patch: Partial<SurvivalOptions>, key?: string) => void) | null;
}) {
  const rm = (result.extras as SurvivalExtras | undefined)?.rmst;
  const unit = timeUnitOf(table);
  if (!rm) return null;
  const def = lastCommonTime(table);
  const level = `${Math.round(100 * (num(rm.ci_level) ? rm.ci_level : 0.95))}%`;
  const groups = (Array.isArray(rm.groups) ? rm.groups : []) as R[];
  const diffs = (Array.isArray(rm.difference) ? rm.difference : []) as R[];
  const ratios = (Array.isArray(rm.ratio) ? rm.ratio : []) as R[];
  const matrix = () => [
    ["Group", "RMST", "SE", `Lower ${level} CI`, `Upper ${level} CI`, "tau"],
    ...groups.map((g) => [String(g.name), raw(g.rmst), raw(g.se), raw(g.ci?.[0]), raw(g.ci?.[1]), raw(g.tau)]),
    ...diffs.map((d) => [`Difference: ${d.label}`, raw(d.estimate), raw(d.se), raw(d.ci?.[0]), raw(d.ci?.[1]), raw(rm.tau)]),
  ];
  return (
    <section className="surv-block" aria-label="Restricted mean survival time">
      <h4>Restricted mean survival time{num(rm.tau) ? ` up to ${atTimeLabel(rm.tau, unit)}` : ""}</h4>
      <div className="surv-controls">
        <CommitNumber label="RMST up to (tau)" value={options.rmstTau} disabled={!set}
          placeholder={def === null ? "" : fmtTime(def)}
          onCommit={(rmstTau) => set?.({ rmstTau: rmstTau && rmstTau > 0 ? rmstTau : null })}
          note={options.rmstTau === null ? "Default: the last time every group was still followed." : undefined} />
      </div>
      {rm.error ? <Problem error={`RMST: ${String(rm.error)}`} /> : (
        <>
          <TableCopy name="Restricted mean survival time" matrix={matrix} />
          <Grid caption="Restricted mean survival time per group"
            head={["Group", "RMST", "SE", `${level} CI`]}
            rows={groups.map((g) => [String(g.name), f(g.rmst), f(g.se), ci(g.ci)])} />
          {diffs.length > 0 && (
            <Grid caption="Differences in restricted mean survival time" className="surv-rmst-diff"
              head={["Difference", "Estimate", `${level} CI`, "P"]}
              rows={diffs.map((d) => [String(d.label), f(d.estimate), ci(d.ci), tableP(d.p)])} />
          )}
          {ratios.length > 0 && (
            <Grid caption="Ratios of restricted mean survival time"
              head={["Ratio", "Estimate", `${level} CI`, "P"]}
              rows={ratios.map((d) => [String(d.label), f(d.estimate), ci(d.ci), tableP(d.p)])} />
          )}
          <Method>
            The RMST is the area under the Kaplan-Meier curve from 0 to tau: the average
            event-free time over the first {num(rm.tau) ? fmtTime(rm.tau) : "tau"}{" "}
            {unit || "time units"}. It stays defined when a median is not reached. {String(rm.tau_rule ?? "")}.
            Standard errors as R&apos;s survRM2; differences and ratios against {String(rm.reference)}
            {" "}with normal-theory {level} CIs and P values. Sources: Royston &amp; Parmar (2013) BMC
            Med Res Methodol 13:152; Uno et al. (2014) J Clin Oncol 32:2380–2385.
          </Method>
        </>
      )}
    </section>
  );
}

// ------------------------------------------------------------ assembled

/** Pairwise comparisons, survival at a time and RMST (after the log-rank
 *  tables). */
export function SurvivalExtrasBlocks({ sheet, table, options, result }: ResultsProps<unknown, R>) {
  const set = useOptionSetter(sheet);
  if (!result || result.error || !result.extras) return null;
  const o = normalizeSurvivalOptions(options);
  return (
    <div className="surv-extras">
      <PairwiseBlock result={result} options={o} set={set} />
      <AtTimeBlock result={result} table={table} options={o} set={set} />
      <RmstBlock result={result} table={table} options={o} set={set} />
    </div>
  );
}

/** Methods text of the survival analysis. */
export function SurvivalMethods({ result, table }: ResultsProps<unknown, R>) {
  const text = survivalMethodsText(result, table, softwareSentence(getRuntimeVersions()));
  return <CopyableMethods text={text} />;
}
