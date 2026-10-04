// Controls (with the "which analysis?" guide), results and methods text of
// the tumour-growth analyses.
import { useProject } from "../../app/context";
import { analysisSheets } from "../../app/factory";
import { newId } from "../../project/ids";
import { addSheets, findSheet } from "../../project/ops";
import type { DataSheet } from "../../project/types";
import { formatSig } from "../../types";
import CopyableMethods from "../common/CopyableMethods";
import { fmtCI, stars } from "../common/statFormat";
import { TwoWayResults } from "../grouped/results";
import { pText } from "./format";
import type { ControlsProps, ResultsProps } from "../types";
import { columnTable, timeTitle, valueTitle } from "./tumour";
import {
  A_TUMOUR_AUC, A_TUMOUR_ENDPOINT, A_TUMOUR_MIXED, type TumourAucOptions, type TumourBase,
  type TumourColumns, type TumourEndpointOptions, type TumourMixedOptions,
} from "./tumourModel";
import { Card, Check, Grid, KV, LinkedTable, Note, Problem, Row, Select, TextIn, Warnings } from "./ui";

/* eslint-disable @typescript-eslint/no-explicit-any */
type R = Record<string, any>;

const f = (v: unknown) => (typeof v === "number" ? formatSig(v) : "n/a");

export const PER_DAY_WARNING = "Avoid a separate t test at each day: repeated tests on the "
  + "same animals push the chance of a false positive to more than double the nominal 5% "
  + "(Oberg et al. 2021, Sci Rep 11:8076). Analyse the whole time course instead, with one "
  + "of the three analyses below.";

const GUIDE: { id: string; title: string; text: string }[] = [
  { id: A_TUMOUR_MIXED, title: "Mixed-effects model of log volume",
    text: "Uses every measurement, including animals removed early, and tests time, group "
      + "and their interaction. Comparisons between groups at each time are corrected as one "
      + "family. The usual first choice." },
  { id: A_TUMOUR_AUC, title: "Area under each animal's curve",
    text: "One number per animal (the trapezoid area of its curve), compared between groups "
      + "with a t test or one-way ANOVA. Simple and robust; areas are only comparable when "
      + "follow-up is similar (or use AUC per unit time)." },
  { id: A_TUMOUR_ENDPOINT, title: "Time to an endpoint volume",
    text: "When each animal reached a volume such as 1000 mm³, with animals that never did "
      + "censored: Kaplan-Meier curves and the log-rank test, as a survival table." },
];

function TumourGuide({ sheetId, parentId, current, readOnly }: {
  sheetId: string; parentId: string; current: string; readOnly: boolean;
}) {
  const { project, apply, select } = useProject();
  const siblings = project.sheets.filter((s) => s.kind === "results" && s.parentId === parentId);
  const add = (id: string) => {
    const existing = siblings.find((s) => s.kind === "results" && s.analysis === id);
    if (existing) { select(existing.id); return; }
    let rid = "";
    apply((p) => {
      const more = analysisSheets(p, parentId, id, newId);
      rid = more[0]?.id ?? "";
      const src = findSheet(p, sheetId);
      // the new analysis reads the same columns as this one
      const cols = src?.kind === "results" ? (src.options as TumourBase).columns : null;
      const patched = more.map((s) => (s.kind === "results" && cols
        ? { ...s, options: { ...(s.options as object), columns: cols } } : s));
      return addSheets(p, patched);
    });
    if (rid) select(rid);
  };
  return (
    <section>
      <h3>Which analysis?</h3>
      <Note warn>{PER_DAY_WARNING}</Note>
      <ul className="assay-guide">
        {GUIDE.map((g) => {
          const on = g.id === current;
          const has = siblings.some((s) => s.kind === "results" && s.analysis === g.id);
          return (
            <li key={g.id} className={on ? "current" : undefined}>
              <strong>{g.title}{on && <span className="assay-current-tag"> · this sheet</span>}</strong>
              {g.text}
              {!on && !readOnly && (
                <div>
                  <button type="button" onClick={() => add(g.id)}>
                    {has ? "Open this analysis" : "Add this analysis"}
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function ColumnPicks({ names, value, onChange }: {
  names: string[]; value: TumourColumns; onChange: (c: TumourColumns) => void;
}) {
  const pickRow = (key: keyof TumourColumns, label: string, optional = false) => (
    <Row label={label}>
      <select value={value[key]} onChange={(e) => onChange({ ...value, [key]: e.target.value })}>
        <option value="">{optional ? "(none: one group)" : "Choose…"}</option>
        {names.map((n) => <option key={n} value={n}>{n}</option>)}
      </select>
    </Row>
  );
  return (
    <section>
      <h3>Columns</h3>
      {pickRow("subject", "Subject (animal ID)")}
      {pickRow("group", "Group", true)}
      {pickRow("time", "Time (e.g. day)")}
      {pickRow("value", "Measured value")}
      <p className="hint-block">One row per measurement (long format), as a study log or
        the tidy import recipe produces it.</p>
    </section>
  );
}

export function TumourControls({ sheet, table, options, onChange, readOnly }: ControlsProps<any>) {
  const o = options as TumourBase & R;
  const set = (patch: R) => onChange({ ...o, ...patch });
  const id = sheet.analysis;
  const names = table.datasets.map((d, i) => d.name.trim() || `Variable ${i + 1}`);
  return (
    <div className="controls">
      <TumourGuide sheetId={sheet.id} parentId={sheet.parentId} current={id} readOnly={readOnly} />
      {table.type === "multivariable" ? (
        <ColumnPicks names={names} value={o.columns} onChange={(columns) => set({ columns })} />
      ) : (
        <section>
          <h3>Layout</h3>
          <p className="hint-block">
            {table.type === "grouped"
              ? "Rows are time points (the number in each row title is the time), data sets are groups and each subcolumn is one subject followed down the rows."
              : "X is time, data sets are groups and each subcolumn is one subject followed down the rows."}
          </p>
        </section>
      )}
      {id !== A_TUMOUR_ENDPOINT && (
        <section>
          <h3>Transform</h3>
          <Check label="Analyse the natural log of the values"
            checked={o.log} onChange={(log) => set({ log })} />
          <p className="hint-block">
            {id === A_TUMOUR_MIXED
              ? "Tumours grow exponentially, so log volume grows along a straight line and its spread is similar at every size: the model's assumptions hold on the log scale. Recommended for volumes."
              : "The area is usually computed on the volumes themselves; on the log scale it reflects the average log volume instead."}
          </p>
          {o.log && (
            <TextIn label="Add before taking logs" value={o.offset}
              onChange={(offset) => set({ offset })}
              hint="For volumes that can be 0 (complete regression), add a small constant such as 1; values that stay at or below zero are left out and counted." />
          )}
        </section>
      )}
      {id === A_TUMOUR_MIXED && (
        <section>
          <h3>Comparisons</h3>
          <Select label="Compare" value={(o as TumourMixedOptions).direction}
            options={[["columns_within_rows", "Groups at each time"],
              ["rows_within_columns", "Times within each group"]]}
            onChange={(direction) => set({ direction })} />
          <Select label="Correction" value={(o as TumourMixedOptions).comparisons}
            options={[["sidak", "Šídák"], ["tukey", "Tukey"], ["bonferroni", "Bonferroni"],
              ["none", "No comparisons"]]}
            onChange={(comparisons) => set({ comparisons })}
            hint="All the comparisons at all times are one family, corrected together, so the overall false-positive rate stays at 5%." />
        </section>
      )}
      {id === A_TUMOUR_AUC && (
        <section>
          <h3>Area</h3>
          <Select label="Baseline" value={(o as TumourAucOptions).baseline}
            options={[["zero", "Zero"], ["first", "Each subject's first value"]]}
            onChange={(baseline) => set({ baseline })} />
          <Check label="Divide by the follow-up time (AUC per unit time)"
            checked={(o as TumourAucOptions).perTime} onChange={(perTime) => set({ perTime })} />
          <p className="hint-block">Animals removed early have shorter curves and smaller
            areas; dividing by each animal's follow-up gives its mean level instead.</p>
          <Check label="Do not assume equal SDs (Welch's t test)"
            checked={(o as TumourAucOptions).welch} onChange={(welch) => set({ welch })} />
        </section>
      )}
      {id === A_TUMOUR_ENDPOINT && (
        <section>
          <h3>Endpoint</h3>
          <TextIn label="Endpoint value" value={(o as TumourEndpointOptions).threshold}
            onChange={(threshold) => set({ threshold })}
            hint="The event is the first measurement at or above this value; subjects that never reach it are censored at their last measurement." />
          <Check label="Interpolate the crossing time (log-linear between measurements)"
            checked={(o as TumourEndpointOptions).interpolate}
            onChange={(interpolate) => set({ interpolate })} />
        </section>
      )}
    </div>
  );
}

function DataSummary({ result, table, options }: { result: R; table: any; options: TumourBase }) {
  const info = result.info ?? {};
  return (
    <KV caption="Data" rows={[
      ["Subjects", `${info.nSubjects ?? "?"} in ${info.groups?.length ?? "?"} group${info.groups?.length === 1 ? "" : "s"} (${(info.groups ?? []).join(", ")})`],
      ["Read from", info.source === "long" ? `long records: ${options.columns.subject}, ${options.columns.group || "(one group)"}, ${options.columns.time}, ${options.columns.value}`
        : info.source === "grouped" ? "grouped table, subjects as subcolumns" : "XY table, subjects as subcolumns"],
      ["Analysed", options.log ? `ln(${valueTitle(table, options)}${(Number(options.offset) || 0) !== 0 ? ` + ${options.offset}` : ""})`
        : valueTitle(table, options)],
    ]} />
  );
}

export function MixedResults({ table, options, result, sheet }: ResultsProps<TumourMixedOptions, R>) {
  if (!result) return null;
  if (result.error) return <Problem result={result} />;
  const info = result.info ?? {};
  return (
    <>
      <Card title="Tumour growth: mixed-effects model">
        <DataSummary result={result} table={table} options={options} />
        {info.timeFromOrder && <Note warn>Some row titles hold no number, so rows are numbered 1, 2, 3, … as the time.</Note>}
        {info.droppedTimes?.length > 0 && <Note warn>{info.droppedTimes.join(", ")} {info.droppedTimes.length === 1 ? "is" : "are"} left
          out of the model: at least one group has no measurement left there (all its animals were removed). The graph still shows {info.droppedTimes.length === 1 ? "it" : "them"}.</Note>}
        {info.dropped > 0 && <Note warn>{info.dropped} value{info.dropped === 1 ? " is" : "s are"} at or below zero and {info.dropped === 1 ? "was" : "were"} left out (no logarithm).</Note>}
        {info.duplicates > 0 && <Note warn>{info.duplicates} repeated measurement{info.duplicates === 1 ? "" : "s"} of a subject at the same time {info.duplicates === 1 ? "was" : "were"} averaged.</Note>}
        <p className="hint-block">
          {timeTitle(table, options)} (repeated within each subject) and group are fixed
          effects and each subject a random effect, fitted by REML; subjects with missing
          or dropped-out measurements keep the values they have. A significant
          interaction means the groups grow at different rates.
        </p>
      </Card>
      <TwoWayResults sheet={sheet} table={result.grouped} options={result.twoWay} result={result} />
    </>
  );
}

export function MixedMethods({ table, options, result }: ResultsProps<TumourMixedOptions, R>) {
  if (!result || result.error) return null;
  const value = valueTitle(table, options).toLowerCase();
  const cmp = options.comparisons === "none" ? "" : ` ${options.direction === "columns_within_rows"
    ? "Groups were compared at each time point" : "Time points were compared within each group"} `
    + `with ${options.comparisons === "sidak" ? "Šídák's" : options.comparisons === "tukey" ? "Tukey's" : "Bonferroni's"} `
    + "correction applied to all comparisons as one family.";
  const text = `${options.log ? `${value.charAt(0).toUpperCase()}${value.slice(1)} was log-transformed (natural log) and analysed`
    : `${value.charAt(0).toUpperCase()}${value.slice(1)} was analysed`} with a linear mixed-effects model `
    + `(REML) with time, treatment group and their interaction as fixed effects and subject as a random `
    + `effect, which uses all available measurements including those of animals removed before the end `
    + `of the study; F tests of the fixed effects are reported with the Geisser-Greenhouse correction.${cmp} `
    + `Analysis in OpenDose (open-source, built on SciPy).`;
  return <CopyableMethods text={text} />;
}

function Comparison({ cmp }: { cmp: R }) {
  const rows: [string, string][] = [];
  if (cmp.F != null) {
    rows.push([cmp.test, `F(${cmp.dfn}, ${cmp.dfd}) = ${f(cmp.F)}, ${pText(cmp.p)} ${stars(cmp.p)}`]);
  } else {
    rows.push([cmp.test, `t(${formatSig(cmp.df, 4)}) = ${f(cmp.t)}, ${pText(cmp.p)} ${stars(cmp.p)}`]);
    rows.push([`Difference (${cmp.names?.[0]} − ${cmp.names?.[1]})`, f(cmp.difference)]);
  }
  return <KV caption="Group comparison" rows={rows} />;
}

export function TumourAucResults({ sheet, table, options, result }: ResultsProps<TumourAucOptions, R>) {
  if (!result) return null;
  if (result.error) return <Problem result={result} />;
  const labels = (result.labels ?? {}) as Record<string, string>;
  const subjects = (result.subjects ?? []) as R[];
  const groups = (result.groups ?? []) as R[];
  const nGroups = (result.table?.datasets ?? []).filter((d: R) => d.ys.length >= 2).length;
  const name = `AUC per subject of ${findName(sheet.name)}`;
  return (
    <>
      <Card title="Area under each subject's curve">
        <DataSummary result={result} table={table} options={options} />
        <Grid caption="AUC per group" head={["Group", "n", "Mean", "SD", "SEM", "95% CI"]}
          rows={groups.map((g) => [g.group, g.n, f(g.mean), f(g.sd), f(g.sem), fmtCI(g.ci)])} />
        {result.comparison ? <Comparison cmp={result.comparison} />
          : <Note>Comparing groups needs at least two groups with two or more subjects each.</Note>}
        <LinkedTable resultsId={sheet.id} name={name} label="Create the AUC column table"
          make={() => columnTable(result)}
          options={() => (nGroups > 2
            ? { analysis: "anova", anovaKind: "parametric", comparisons: "tukey" }
            : { analysis: "ttest", ttestKind: options.welch ? "welch" : "unpaired" })}
          note="One column per group, one AUC per subject, analysed with a t test (two groups) or one-way ANOVA. The table is linked: it follows edits to the data and these settings." />
      </Card>
      <Card title="AUC of each subject">
        <Grid caption="AUC per subject" head={["Subject", "Group", "AUC", "Points", "First time", "Last time"]}
          rows={subjects.map((s) => [labels[s.subject] ?? s.subject, s.group,
            s.auc == null ? "n/a (fewer than 2 points)" : f(s.auc), s.n_points, f(s.t_first), f(s.t_last)])} />
      </Card>
    </>
  );
}

const findName = (sheetName: string) => sheetName.replace(/^AUC per subject of /, "");

export function TumourAucMethods({ table, options, result }: ResultsProps<TumourAucOptions, R>) {
  if (!result || result.error) return null;
  const value = valueTitle(table, options).toLowerCase();
  const test = result.comparison?.test;
  const text = `The area under each animal's ${options.log ? `log ${value}` : value} curve was computed by `
    + `the trapezoid rule${options.baseline === "first" ? " above its first value" : ""}${
      options.perTime ? " and divided by the animal's follow-up time" : ""}. `
    + (test ? `Areas were compared between groups with ${test === "one-way ANOVA"
      ? "an ordinary one-way ANOVA" : `an ${test}`}. ` : "")
    + "Analysis in OpenDose (open-source, built on SciPy).";
  return <CopyableMethods text={text} />;
}

export function EndpointResults({ sheet, table, options, result }: ResultsProps<TumourEndpointOptions, R>) {
  const { project } = useProject();
  if (!result) return null;
  if (result.error) return <Problem result={result} />;
  const rows = (result.rows ?? []) as R[];
  const km = (result.km ?? {}) as R;
  const curves = (km.curves ?? {}) as Record<string, R>;
  const parent = findSheet(project, sheet.parentId) as DataSheet | undefined;
  return (
    <>
      <Card title={`Time to reach ${formatSig(result.threshold)}`}>
        <DataSummary result={result} table={table} options={options} />
        <Grid caption="Events per group" head={["Group", "Subjects", "Reached the endpoint", "Censored", "Median time"]}
          rows={(result.groups as string[]).map((g) => {
            const c = curves[g] ?? {};
            return [g, c.n ?? rows.filter((r) => r.group === g).length, c.n_events ?? "?",
              c.n_censored ?? "?", c.median_survival == null ? "undefined" : f(c.median_survival)];
          })} />
        {km.logrank && (
          <KV caption="Comparison of the curves" rows={[
            ["Log-rank (Mantel-Cox) test", `χ²(${km.logrank.df}) = ${f(km.logrank.chi2)}, ${pText(km.logrank.p)} ${stars(km.logrank.p)}`],
            ...(km.gehan_breslow_wilcoxon ? [["Gehan-Breslow-Wilcoxon test",
              `χ²(${km.gehan_breslow_wilcoxon.df}) = ${f(km.gehan_breslow_wilcoxon.chi2)}, ${pText(km.gehan_breslow_wilcoxon.p)}`]] as [string, string][] : []),
          ]} />
        )}
        <Warnings list={km.error ? [km.error] : []} />
        <LinkedTable resultsId={sheet.id} name={`Time to endpoint of ${parent?.name ?? "data"}`}
          label="Create the survival table" make={() => result.survival}
          note="One row per subject (time, and 1 = reached the endpoint or 0 = censored), analysed with Kaplan-Meier curves and the log-rank test on its own sheet. The table is linked: it follows edits to the data and the endpoint." />
      </Card>
      <Card title="Each subject">
        <Grid caption="Time to endpoint per subject" head={["Subject", "Group", "Time", "Event", "Value at that time"]}
          rows={rows.map((r) => [r.label, r.group, f(r.time), r.event ? "Reached" : "Censored", f(r.lastValue)])} />
      </Card>
    </>
  );
}

export function EndpointMethods({ table, options, result }: ResultsProps<TumourEndpointOptions, R>) {
  if (!result || result.error) return null;
  const value = valueTitle(table, options).toLowerCase();
  const text = `Time to endpoint was defined as the first time ${value} reached ${options.threshold}`
    + `${options.interpolate ? " (interpolated log-linearly between measurements)" : ""}; animals that did `
    + `not reach it were censored at their last measurement. Survival curves were estimated by the `
    + `Kaplan-Meier method and compared with the log-rank (Mantel-Cox) test. Analysis in OpenDose `
    + `(open-source, built on SciPy).`;
  return <CopyableMethods text={text} />;
}
