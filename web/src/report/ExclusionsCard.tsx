// Under a results sheet: what was excluded and why, n entered / excluded
// / analysed per group, the sentence the methods and legend carry, and a
// one-click comparison with the results the analysis gives with the
// excluded values included. The comparison runs on the side (never
// cached, never saved): the stored result is the one with the
// exclusions. Values can also be left out of this analysis only (P-68, a
// sensitivity analysis, project/leftOut.ts): they stay in the table and
// in every other analysis, each with its reason, and the results with
// them put back show next to these at once. Nothing here excludes a value
// by itself (the "do not build" rule on automatic outlier deletion): it
// reports what the user excluded. Sources: ARRIVE 2.0 item 3b, the
// British Journal of Pharmacology design guidance, GraphPad's "Excluding
// values".
import { useEffect, useId, useMemo, useState } from "react";
import { resultKey } from "../app/analysis";
import { useProject } from "../app/context";
import { CopyButton } from "../components/CiteBlock";
import { isCancelled, runEngine } from "../lib/engine";
import {
  EXCLUSION_SOURCES, MAX_REASON_LENGTH, PRESET_REASONS, exclusionGroups, exclusionSentence,
  excludedValues, includeExcluded, reasonsText, setReasons, type ExcludedValue,
} from "../project/exclusions";
import { leftOutClause, leftOutRows, withoutLeftOut, type LeftOutRow } from "../project/leftOut";
import { updateTable } from "../project/ops";
import { compareResults, formatChanged } from "../project/reproduce";
import type { DataSheet, DataTableModel, ResultsSheet } from "../project/types";
import { analysisDef } from "../sheets/registry";
import type { AnalysisDef } from "../sheets/types";
import LeaveOutDialog from "./LeaveOutDialog";
import { resultSentence } from "./sentences";
import { useReportPrefs } from "./useReport";
import "./report.css";
import "./integrity.css";
import { Button, notify } from "../components/ui";

const isError = (r: unknown) => !r || typeof r !== "object" || "error" in (r as object);

/** The analysis' result for another table, computed on the side while
 *  `on` (never cached or saved): null until it arrives. */
function useSideResult(on: boolean, def: AnalysisDef | undefined, analysis: string,
  options: unknown, table: DataTableModel): unknown {
  const key = useMemo(() => (on && def ? resultKey(analysis, options, table) : ""),
    [on, def, analysis, options, table]);
  const [res, setRes] = useState<{ key: string; result: unknown } | null>(null);
  useEffect(() => {
    if (!key || !def || res?.key === key) return;
    const ctl = new AbortController();
    runEngine((engine) => def.run(engine, table, options), { signal: ctl.signal, priority: "user" })
      .then((r) => setRes({ key, result: r }),
        (e) => { if (!isCancelled(e)) setRes({ key, result: { error: e instanceof Error ? e.message : String(e) } }); });
    return () => ctl.abort();
  }, [key, def, table, options, res?.key]);
  return res && res.key === key ? res.result : null;
}

/**
 * `table` is the data table as entered; `analysed` is what this analysis
 * sees (the values left out of it excluded too: project/leftOut.ts
 * sheetTable), the input of `result`.
 */
export default function ExclusionsCard({ sheet, table, analysed, options, result }: {
  sheet: ResultsSheet; table: DataTableModel; analysed: DataTableModel; options: unknown;
  result: unknown;
}) {
  const api = useProject();
  const prefs = useReportPrefs();
  const listId = useId();
  const values = useMemo(() => excludedValues(table), [table]);
  const left = useMemo(() => leftOutRows(table, sheet.leftOut), [table, sheet.leftOut]);
  const groups = useMemo(() => exclusionGroups(analysed), [analysed]);
  const sentence = useMemo(() => exclusionSentence(analysed), [analysed]);
  const clause = useMemo(() => leftOutClause(table, sheet.leftOut), [table, sheet.leftOut]);
  const [leaving, setLeaving] = useState(false);
  // The comparison is asked for per results sheet.
  const [askedFor, setAskedFor] = useState<string | null>(null);
  const showAll = askedFor === sheet.id;
  const def = analysisDef(table.type, sheet.analysis);
  const alt = useMemo(() => includeExcluded(analysed), [analysed]);
  const current = useSideResult(showAll && values.length > 0, def, sheet.analysis,
    options, alt);
  // Left out of this analysis only: the results with them put back (the
  // analysis as the table has it) always show beside these.
  const applied = left.some((r) => r.state === "applies");
  const withLeft = useSideResult(applied, def, sheet.analysis, options, table);

  const data = api.project.sheets.find((s) => s.id === sheet.parentId) as DataSheet | undefined;
  const readOnly = !data || !!data.frozen || !!data.derived || api.readOnly;
  // Leaving a value out changes this results sheet only, never the table.
  const canLeaveOut = !!data && !api.readOnly && !sheet.frozen;
  const leaveOut = canLeaveOut ? (
    <div className="exc-actions">
      <Button size="sm" onClick={() => setLeaving(true)}>Leave out of this analysis…</Button>
      {leaving && <LeaveOutDialog sheet={sheet} table={table} onClose={() => setLeaving(false)} />}
    </div>
  ) : null;

  if (!values.length && !left.length) {
    if (!canLeaveOut) return null;
    return (
      <section className="report-card exclusions-card exclusions-none" aria-label="Exclusions">
        <h3>Exclusions</h3>
        <p className="exc-lead">
          Every value in “{data.name}” is analysed. To see whether one value drives these
          results, leave it out of this analysis only: the table and the other analyses keep it.
        </p>
        {leaveOut}
      </section>
    );
  }
  const setReason = (v: ExcludedValue, text: string) => {
    if (!data || readOnly || text.trim() === v.reason) return;
    api.apply((p) => updateTable(p, data.id, (t) => setReasons(t,
      [{ kind: "y", dataset: v.dataset, row: v.row, sub: v.sub }], text)));
  };
  const putBack = (r: LeftOutRow) => {
    api.apply((p) => withoutLeftOut(p, sheet.id, r.key));
    notify(`Put ${r.group}, ${r.where} (${r.value}) back into “${sheet.name}”.`, { tone: "success" });
  };
  const methods = [sentence, clause].filter(Boolean).join("; ");
  const tableName = data?.name ?? "the table";

  return (
    <section className="report-card exclusions-card" aria-label="Exclusions">
      <h3>Exclusions</h3>
      {values.length > 0 && (
        <p className="exc-lead">
          {values.length === 1 ? "1 value is" : `${values.length} values are`} excluded in “{tableName}”:
          {" "}kept in the table (struck through) and left out of these results and the graphs.
        </p>
      )}
      {left.length > 0 && (
        <p className="exc-lead">
          {left.length === 1 ? "1 value is" : `${left.length} values are`} left out of these
          results only, as a sensitivity analysis: {left.length === 1 ? "it stays" : "they stay"} in
          “{tableName}” and in every other analysis of it.
        </p>
      )}
      {groups && (
        <table className="results-table exc-groups">
          <thead>
            <tr><th scope="col">Group</th><th scope="col">Entered</th><th scope="col">Excluded</th>
              <th scope="col">Analysed</th><th scope="col">Reasons</th></tr>
          </thead>
          <tbody>
            {groups.map((g) => (
              <tr key={g.name}>
                <th scope="row">{g.name}</th>
                <td>{g.entered}</td><td>{g.excluded}</td><td>{g.analysed}</td>
                <td>{g.excluded ? reasonsText(g.reasons) : ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {values.length > 0 && (
        <>
          <h4>Excluded values</h4>
          <ul className="exc-values">
            {values.map((v) => (
              <li key={`${v.dataset}:${v.row}:${v.sub}`}>
                <span className="exc-where">{v.group}, {v.where}: <strong>{v.value}</strong></span>
                {v.dataset < 0 || readOnly ? (
                  <span className="exc-reason">{v.reason || "no reason recorded"}</span>
                ) : (
                  <input key={v.reason} type="text" className="exc-reason-input" list={listId}
                    defaultValue={v.reason} maxLength={MAX_REASON_LENGTH} placeholder="no reason recorded"
                    aria-label={`Reason for excluding ${v.group}, ${v.where}`}
                    onBlur={(e) => setReason(v, e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") setReason(v, e.currentTarget.value); }} />
                )}
              </li>
            ))}
          </ul>
          <datalist id={listId}>{PRESET_REASONS.map((r) => <option key={r} value={r} />)}</datalist>
        </>
      )}
      {left.length > 0 && (
        <>
          <h4>Left out of this analysis only</h4>
          <ul className="exc-values exc-left">
            {left.map((r) => (
              <li key={r.key}>
                <span className="exc-where">{r.group}, {r.where}: <strong>{r.value}</strong></span>
                <span className="exc-reason">{r.reason}</span>
                {r.state !== "applies" && (
                  <span className="exc-state">
                    {r.state === "in-table"
                      ? "Now excluded in the table itself, so every analysis leaves it out."
                      : "Not left out: this cell no longer holds the value (rows moved or the value changed)."}
                  </span>
                )}
                {canLeaveOut && (
                  <Button size="sm" aria-label={`Put back ${r.group}, ${r.where}`}
                    onClick={() => putBack(r)}>Put back</Button>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
      {leaveOut}
      {methods && (
        <div className="report-block">
          <h4>In the methods and the legend</h4>
          <p className="exc-sentence">{methods}.</p>
          <CopyButton text={`${methods}.`} label="Copy" />
        </div>
      )}
      {applied && def && (
        <div className="exc-compare">
          <Comparison result={result} alt={withLeft} digits={api.project.prefs.digits}
            style={prefs.pStyle} prefs={prefs} labels={LEFT_LABELS} />
        </div>
      )}
      {def && values.length > 0 && (
        <div className="exc-compare">
          <Button aria-pressed={showAll}
            onClick={() => setAskedFor(showAll ? null : sheet.id)}>
            {showAll ? "Hide results with excluded values included" : "Show results with excluded values included"}
          </Button>
          {showAll && (
            <Comparison result={result} alt={current} digits={api.project.prefs.digits}
              style={prefs.pStyle} prefs={prefs} labels={ALL_LABELS} />
          )}
        </div>
      )}
      <p className="exc-sources">
        Excluded values are never removed or chosen automatically: report each with its reason,
        and the results with and without them when the choice could matter. Sources:{" "}
        {EXCLUSION_SOURCES.map((s, i) => (
          <span key={s.url}>{i ? "; " : ""}<a href={s.url} target="_blank" rel="noreferrer">{s.label}</a></span>
        ))}.
      </p>
    </section>
  );
}

interface CompareLabels {
  group: string; note: string; asIs: string; all: string; pending: string; fails: string;
}

const ALL_LABELS: CompareLabels = {
  group: "Results with excluded values included",
  note: "For comparison only: the results above, saved with the project and used by graphs and "
    + "reports, leave the excluded values out.",
  asIs: "As analysed (excluded values left out)",
  all: "With excluded values included",
  pending: "Computing the results with every value included…",
  fails: "With the excluded values included the analysis fails",
};

const LEFT_LABELS: CompareLabels = {
  group: "Results with the left-out values put back",
  note: "Report both: these results leave the values above out of this analysis only; with them "
    + "put back, the analysis gives what the table as entered gives.",
  asIs: "As analysed (left out of this analysis)",
  all: "With them put back (as in the table)",
  pending: "Computing the results with the left-out values put back…",
  fails: "With the left-out values put back the analysis fails",
};

function Comparison({ result, alt, digits, style, prefs, labels }: {
  result: unknown; alt: unknown; digits: number;
  style: ReturnType<typeof useReportPrefs>["pStyle"]; prefs: ReturnType<typeof useReportPrefs>;
  labels: CompareLabels;
}) {
  const changes = useMemo(() => (alt && !isError(alt) && !isError(result)
    ? compareResults(result, alt, { digits }).changes : []), [result, alt, digits]);
  if (!alt) return <p className="exc-pending" role="status">{labels.pending}</p>;
  if (isError(alt)) {
    return <p className="exc-pending" role="status">{labels.fails}: {String((alt as { error?: unknown }).error ?? "")}</p>;
  }
  const sorted = [...changes].sort((a, b) => Number(b.p) - Number(a.p));
  const asIs = resultSentence(result, { style, prefs });
  const all = resultSentence(alt, { style, prefs });
  return (
    <div className="exc-results" role="group" aria-label={labels.group}>
      <p className="hint-block">{labels.note}</p>
      <div className="exc-cols">
        <div>
          <h5>{labels.asIs}</h5>
          <p className="exc-as-is">{asIs || "No summary sentence for this analysis."}</p>
        </div>
        <div>
          <h5>{labels.all}</h5>
          <p className="exc-all">{all || "No summary sentence for this analysis."}</p>
        </div>
      </div>
      {sorted.length ? (
        <>
          <h5>Numbers that change</h5>
          <ul className="exc-changes">
            {sorted.slice(0, 10).map((c, i) => (
              <li key={i}>{c.what}{c.context.length ? ` (${c.context.join(", ")})` : ""}:{" "}
                {formatChanged(c.saved, c.p, digits)} → {formatChanged(c.now, c.p, digits)}</li>
            ))}
            {sorted.length > 10 && <li>…and {sorted.length - 10} more</li>}
          </ul>
        </>
      ) : <p className="hint-block">No number of the results changes at the precision shown.</p>}
    </div>
  );
}
