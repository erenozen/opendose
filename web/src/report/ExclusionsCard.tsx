// Under a results sheet whose table has excluded values: what was
// excluded and why, n entered / excluded / analysed per group, the
// sentence the methods and legend carry, and a one-click comparison with
// the results the analysis gives with the excluded values included. The
// comparison runs on the side (never cached, never saved): the stored
// result is the one with the exclusions. Nothing here excludes a value
// (the "do not build" rule on automatic outlier deletion): it reports
// what the user excluded. Sources: ARRIVE 2.0 item 3b, the British
// Journal of Pharmacology design guidance, GraphPad's "Excluding values".
import { useEffect, useId, useMemo, useState } from "react";
import { resultKey } from "../app/analysis";
import { useProject } from "../app/context";
import { CopyButton } from "../components/CiteBlock";
import { isCancelled, runEngine } from "../lib/engine";
import {
  EXCLUSION_SOURCES, MAX_REASON_LENGTH, PRESET_REASONS, exclusionGroups, exclusionSentence,
  excludedValues, includeExcluded, reasonsText, setReasons, type ExcludedValue,
} from "../project/exclusions";
import { updateTable } from "../project/ops";
import { compareResults, formatChanged } from "../project/reproduce";
import type { DataSheet, DataTableModel, ResultsSheet } from "../project/types";
import { analysisDef } from "../sheets/registry";
import { resultSentence } from "./sentences";
import { useReportPrefs } from "./useReport";
import "./report.css";
import "./integrity.css";

const isError = (r: unknown) => !r || typeof r !== "object" || "error" in (r as object);

export default function ExclusionsCard({ sheet, table, options, result }: {
  sheet: ResultsSheet; table: DataTableModel; options: unknown; result: unknown;
}) {
  const api = useProject();
  const prefs = useReportPrefs();
  const listId = useId();
  const values = useMemo(() => excludedValues(table), [table]);
  const groups = useMemo(() => exclusionGroups(table), [table]);
  const sentence = useMemo(() => exclusionSentence(table), [table]);
  // The comparison is asked for per results sheet.
  const [askedFor, setAskedFor] = useState<string | null>(null);
  const showAll = askedFor === sheet.id;
  const def = analysisDef(table.type, sheet.analysis);
  const alt = useMemo(() => includeExcluded(table), [table]);
  const altKey = useMemo(() => (showAll && def && values.length
    ? resultKey(sheet.analysis, options, alt) : ""), [showAll, def, values.length, sheet.analysis, options, alt]);
  const [altRes, setAltRes] = useState<{ key: string; result: unknown } | null>(null);
  useEffect(() => {
    if (!altKey || !def || altRes?.key === altKey) return;
    const ctl = new AbortController();
    runEngine((engine) => def.run(engine, alt, options), { signal: ctl.signal, priority: "user" })
      .then((r) => setAltRes({ key: altKey, result: r }),
        (e) => { if (!isCancelled(e)) setAltRes({ key: altKey, result: { error: e instanceof Error ? e.message : String(e) } }); });
    return () => ctl.abort();
  }, [altKey, def, alt, options, altRes?.key]);

  if (!values.length) return null;
  const data = api.project.sheets.find((s) => s.id === sheet.parentId) as DataSheet | undefined;
  const readOnly = !data || !!data.frozen || !!data.derived || api.readOnly;
  const setReason = (v: ExcludedValue, text: string) => {
    if (!data || readOnly || text.trim() === v.reason) return;
    api.apply((p) => updateTable(p, data.id, (t) => setReasons(t,
      [{ kind: "y", dataset: v.dataset, row: v.row, sub: v.sub }], text)));
  };
  const current = altRes && altRes.key === altKey ? altRes.result : null;

  return (
    <section className="report-card exclusions-card" aria-label="Exclusions">
      <h3>Exclusions</h3>
      <p className="exc-lead">
        {values.length === 1 ? "1 value is" : `${values.length} values are`} excluded in “{data?.name ?? "the table"}”:
        {" "}kept in the table (struck through) and left out of these results and the graphs.
      </p>
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
      {sentence && (
        <div className="report-block">
          <h4>In the methods and the legend</h4>
          <p className="exc-sentence">{sentence}.</p>
          <CopyButton text={`${sentence}.`} label="Copy" />
        </div>
      )}
      {def && (
        <div className="exc-compare">
          <button type="button" aria-pressed={showAll}
            onClick={() => setAskedFor(showAll ? null : sheet.id)}>
            {showAll ? "Hide results with excluded values included" : "Show results with excluded values included"}
          </button>
          {showAll && (
            <Comparison result={result} alt={current} digits={api.project.prefs.digits}
              style={prefs.pStyle} prefs={prefs} />
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

function Comparison({ result, alt, digits, style, prefs }: {
  result: unknown; alt: unknown; digits: number;
  style: ReturnType<typeof useReportPrefs>["pStyle"]; prefs: ReturnType<typeof useReportPrefs>;
}) {
  const changes = useMemo(() => (alt && !isError(alt) && !isError(result)
    ? compareResults(result, alt, { digits }).changes : []), [result, alt, digits]);
  if (!alt) return <p className="exc-pending" role="status">Computing the results with every value included…</p>;
  if (isError(alt)) {
    return <p className="exc-pending" role="status">With the excluded values included the analysis fails: {String((alt as { error?: unknown }).error ?? "")}</p>;
  }
  const sorted = [...changes].sort((a, b) => Number(b.p) - Number(a.p));
  const asIs = resultSentence(result, { style, prefs });
  const all = resultSentence(alt, { style, prefs });
  return (
    <div className="exc-results" role="group" aria-label="Results with excluded values included">
      <p className="hint-block">For comparison only: the results above, saved with the project and
        used by graphs and reports, leave the excluded values out.</p>
      <div className="exc-cols">
        <div>
          <h5>As analysed (excluded values left out)</h5>
          <p className="exc-as-is">{asIs || "No summary sentence for this analysis."}</p>
        </div>
        <div>
          <h5>With excluded values included</h5>
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
