import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { resolveOptions } from "../app/analysis";
import { useCommands } from "../app/commands";
import { useProject } from "../app/context";
import { useAnalysisResult } from "../app/useAnalysisResult";
import {
  findSheet, updateResultsOptions, updateSheet, updateTable,
} from "../project/ops";
import { withExclusionsBlanked } from "../project/table";
import type {
  DataSheet, DataTableModel, GraphSheet, Project, ResultsSheet, Sheet,
} from "../project/types";
import { analysisDef, graphDef, tableDef } from "../sheets/registry";
import PlaceholderPanel from "../sheets/common/PlaceholderPanel";
import OriginNote from "../sheets/manipulate/OriginNote";
import ResultsExport from "../sheets/common/ResultsExport";
import type { AsideProps, TableEdit } from "../sheets/types";
import type { SchemeId } from "../lib/palette";
import { fileStem } from "../export/settings";
import { isDefaultFormat, readFormat, type GraphFormat } from "../graph";
import { useFormatDialogs } from "../graph/useFormatDialogs";
import FigurePanel from "../graph/FigurePanel";

import ColumnSplitter from "./ColumnSplitter";
import ExportPanel from "./ExportPanel";
import GraphSettings from "./GraphSettings";
import { GenericMethodsText } from "./MethodsText";
import HSplitter from "./HSplitter";
import { SnowflakeIcon } from "./SheetIcon";
import WelcomePanel from "./WelcomePanel";
import { AnalysisBusy, EngineBootNote } from "./EngineStatus";
import FitGuardNote from "./FitGuardNote";
import { notFittedReason } from "../app/fitGuard";
import { useGuideOptional } from "../guide/context";
import EntryGuide from "../guide/EntryGuide";
import { DifferNote, ResultsGuide } from "../guide/ResultsGuide";
import EffectSizeCard from "../report/EffectSizeCard";
import GraphLegend from "../report/GraphLegend";
import ReportCard from "../report/ReportCard";
import StatsMethodsCard from "../report/StatsMethodsCard";

/**
 * The workbench for one family: the data table (left) with the active
 * analysis' parameters under it, and the active graph, results and methods
 * text (right). Which results / graph sheet is active follows the
 * navigator selection and the analysis tabs in the header.
 */
export default function FamilyWorkspace({ data }: { data: DataSheet }) {
  const api = useProject();
  const { project, apply, engineReady, status, engineError, bootEngine, engine } = api;
  const cmd = useCommands();
  const guide = useGuideOptional();
  const mainRef = useRef<HTMLElement>(null);
  const def = tableDef(data.table.type);
  const resSheet = api.activeResults(data.id);
  const graph = api.activeGraph(data.id);
  const aDef = resSheet ? analysisDef(data.table.type, resSheet.analysis) : undefined;

  const { result, options, status: resStatus } = useAnalysisResult(resSheet, data.table);
  // A graph may draw from a results sheet other than the active one.
  const graphRes = graph?.resultsId && graph.resultsId !== resSheet?.id
    ? findSheet(project, graph.resultsId) as ResultsSheet | undefined : undefined;
  const other = useAnalysisResult(graphRes ?? null, graphRes ? data.table : null);

  // The engine-ready reveal animates once per session.
  const reveal = engineReady && !api.switchedRef.current ? " reveal" : "";

  const dataId = data.id;
  const onTableChange: TableEdit = useCallback((fn, key) =>
    apply((p) => updateTable(p, dataId, fn), key ? `table:${key}` : null), [apply, dataId]);

  const editFamily: AsideProps["editFamily"] = (edit) => apply((p) => {
    let next = edit.table ? updateTable(p, data.id, edit.table) : p;
    for (const [aid, fn] of Object.entries(edit.options ?? {})) {
      for (const s of next.sheets) {
        if (s.kind === "results" && s.parentId === data.id && s.analysis === aid) {
          const d = analysisDef(data.table.type, aid);
          next = updateResultsOptions(next, s.id,
            (o) => fn(resolveOptions(d, o, data.table, next.prefs)));
        }
      }
    }
    return next;
  });

  // Derived tables (chains) are recomputed from their source: read-only.
  // So is everything in a project opened from a share link (src/share).
  const shared = api.readOnly;
  const readOnly = !!data.frozen || !!data.derived || shared;
  // Table types whose editor is final but whose analyses are not out yet.
  const entryOnly = def.status === "entry-only" || !def.analyses.length;
  const Editor = def.Editor;
  const Aside = def.EditorAside;
  const Controls = aDef?.ControlsPanel ?? def.ControlsPanel;
  const Results = aDef?.ResultsPanel ?? def.ResultsPanel;
  // Analyses without their own methods text get a generic, correct one.
  const Methods = aDef?.MethodsPanel ?? (aDef ? GenericMethodsText : undefined);

  const constants = useMemo(() => projectConstants(project), [project]);
  // The grid re-renders only when its own inputs change, not each time a
  // computation starts or a result arrives (a large grid is costly).
  const editor = useMemo(() => (
    <Editor sheet={data} table={data.table} readOnly={readOnly} onChange={onTableChange} />
  ), [Editor, data, readOnly, onTableChange]);
  // A large table's graph follows edits once typing pauses: redrawing
  // thousands of points on every keystroke would hold up the grid.
  const settledTable = useSettledTable(data.table);
  // A large table scrolls inside its card: the browser then lays out and
  // composites only the rows in view instead of thousands on every edit.
  const largeTable = useMemo(() => cellCount(data.table) > LARGE_TABLE_CELLS, [data.table]);
  const graphData = useMemo(() => (settledTable === data.table ? data
    : { ...data, table: settledTable }), [data, settledTable]);

  return (
    <main ref={mainRef}>
      {/* The engine runs in a worker: the editor works while it loads and
          while it computes; analyses queue until it is ready. */}
      <div className="left">
        {Aside && !readOnly && (
          <>
            <div className="pane pane-import">
              <Aside sheet={data} table={data.table} readOnly={readOnly}
                onChange={onTableChange} editFamily={editFamily} />
            </div>
            <HSplitter />
          </>
        )}
        <div className={`pane pane-table${largeTable ? " large-table" : ""}`}>
          {data.frozen && (
            <FrozenNote what="data table" onUnfreeze={() => cmd.toggleFreeze(data.id)} />
          )}
          <OriginNote data={data} />
          {!readOnly && <EntryGuide data={data} />}
          {editor}
        </div>
        {!entryOnly && (
          <>
            <HSplitter />
            <div className="pane pane-controls">
              {resSheet && Controls ? (
                <>
                  {resSheet.frozen && (
                    <FrozenNote what="results sheet"
                      onUnfreeze={() => cmd.toggleFreeze(resSheet.id)} />
                  )}
                  <div className="controls-wrap" inert={!!resSheet.frozen || shared}>
                    <Suspense fallback={<Pending />}>
                      <Controls sheet={resSheet} table={data.table} options={options}
                        readOnly={!!resSheet.frozen || shared}
                        onChange={(o) => apply((p) => updateResultsOptions(p, resSheet.id, () => o),
                          `options:${resSheet.id}`)} />
                    </Suspense>
                  </div>
                </>
              ) : (
                <div className="controls">
                  <section>
                    <h3>No analysis yet</h3>
                    <p className="hint-block">
                      Use Analyze in the toolbar to add one; its results and graph
                      appear next to this table.
                    </p>
                    {guide && (
                      <button type="button" onClick={guide.openWizard}>Which test?…</button>
                    )}
                  </section>
                </div>
              )}
              {constants.length > 0 && <ConstantsList constants={constants} />}
            </div>
          </>
        )}
      </div>
      <ColumnSplitter mainRef={mainRef} />
      <div className="right">
        {!engineReady && (engineError || result == null) ? (
          <div className="pane pane-plot">
            <WelcomePanel status={status} error={engineError} onRetry={bootEngine}
              engine={engine} />
          </div>
        ) : (
          <>
            {/* Saved (or bundled example) results show at once; the live
                engine replaces them when it is up. */}
            {!engineReady && (
              <div className="pane pane-boot">
                <EngineBootNote engine={engine} live={resStatus.live} />
              </div>
            )}
            {graph && (
              <>
                <div className={`pane pane-plot${reveal}`}>
                  <GraphCard graph={graph} data={graphData}
                    result={graph.resultsId === resSheet?.id ? result : other.result}
                    options={graph.resultsId === resSheet?.id ? options : other.options} />
                </div>
                <HSplitter />
              </>
            )}
            {resSheet && Results && (
              <div className={`pane pane-results${reveal}`}
                data-live={resStatus.live ? "true" : "false"}
                aria-busy={resStatus.pending ? true : undefined}>
                {engineReady && <AnalysisBusy status={resStatus} engine={engine} />}
                {notFittedReason(result) && (
                  <FitGuardNote reason={notFittedReason(result)!} readOnly={readOnly}
                    onFit={(patch) => apply((p) => updateResultsOptions(p, resSheet.id,
                      (o) => ({ ...(o as object), ...patch })))} />
                )}
                <ResultsGuide analysisId={resSheet.analysis} tableType={data.table.type}
                  table={data.table} options={options} result={result}
                  dataId={data.id} readOnly={readOnly} />
                <ResultsExport name={resSheet.name}>
                  <Suspense fallback={<Pending />}>
                    <Results sheet={resSheet} table={data.table} options={options} result={result} />
                  </Suspense>
                  {/* Effect sizes of every comparison (src/report). */}
                  <EffectSizeCard result={result} />
                </ResultsExport>
                <DifferNote analysisId={resSheet.analysis} tableType={data.table.type}
                  table={data.table} options={options} result={result} />
                <ReportCard sheet={resSheet} table={data.table} options={options} result={result} />
              </div>
            )}
            {resSheet && Methods && (
              <>
                <HSplitter />
                <div className="pane pane-methods">
                  <Suspense fallback={null}>
                    <Methods sheet={resSheet} table={data.table} options={options} result={result} />
                  </Suspense>

                  <StatsMethodsCard sheet={resSheet} result={result} />
                </div>
              </>
            )}
            {entryOnly ? (
              <div className={`pane pane-results${reveal}`}>
                <PlaceholderPanel label={def.label} hint={def.entryHint} />
              </div>
            ) : !graph && !resSheet && (
              <div className="pane pane-results">
                <div className="empty-hint result-card">
                  No results or graphs for this table yet.
                  {guide && (
                    <div className="results-empty-actions">
                      <button type="button" className="btn-primary" onClick={guide.openWizard}>
                        Which test?…</button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}

/** Cells beyond which the graph waits for a pause in typing. */
const LARGE_TABLE_CELLS = 4000;
const SETTLE_MS = 500;

function cellCount(t: DataTableModel): number {
  let n = t.x.length;
  for (const d of t.datasets) n += d.rows.length * (d.rows[0]?.length ?? 1);
  return n;
}

/** The table itself for small tables; for large ones, the table as it
 *  was when edits last paused for SETTLE_MS. */
function useSettledTable(table: DataTableModel): DataTableModel {
  const large = cellCount(table) > LARGE_TABLE_CELLS;
  const [settled, setSettled] = useState(table);
  useEffect(() => {
    if (!large || settled === table) return;
    const t = setTimeout(() => setSettled(table), SETTLE_MS);
    return () => clearTimeout(t);
  }, [large, table, settled]);
  return large ? settled : table;
}

/** Shown while a panel's code loads (sheets/lazy.ts): usually a moment. */
function Pending() {
  return <p className="empty-hint pane-pending" aria-busy="true">Loading…</p>;
}

function FrozenNote({ what, onUnfreeze }: { what: string; onUnfreeze: () => void }) {
  return (
    <div className="frozen-note" role="note">
      <SnowflakeIcon />
      <span>This {what} is frozen and does not change.</span>
      <button type="button" onClick={onUnfreeze}>Unfreeze</button>
    </div>
  );
}

function GraphCard({ graph, data, result, options }: {
  graph: GraphSheet;
  data: DataSheet;
  result: unknown;
  options: unknown;
}) {
  const { apply, engineReady, project, readOnly: shared } = useProject();
  const kind = graphDef(data.table.type, graph.graphType);
  const def = tableDef(data.table.type);
  const Plot = kind?.PlotPanel ?? def.PlotPanel;
  const snap = graph.frozen ? graph.snapshot : undefined;
  const table: DataTableModel = useMemo(
    () => snap?.table ?? withExclusionsBlanked(data.table), [snap, data.table]);
  const res = snap ? snap.result : result;
  const opts = snap ? snap.options : options;
  const auto = kind ? kind.autoTitles(table, opts) : { x: "", y: "" };
  const titles = graph.settings.titles;
  const resolved = {
    x: titles.x.trim() || auto.x,
    y: titles.y.trim() || auto.y,
  };
  // Kinds this graph can switch to: same group, drawing the raw table or
  // the analysis the graph is bound to.
  const bound = graph.resultsId ? findSheet(project, graph.resultsId) : undefined;
  const boundAnalysis = bound?.kind === "results" ? bound.analysis : null;
  const siblings = kind ? def.graphs.filter((g) => g.group === kind.group
    && (g.analysis === null || g.analysis === boundAnalysis || g.id === kind.id)) : [];
  const edit = (fn: (g: GraphSheet) => GraphSheet, key: string) =>
    apply((p) => updateSheet<Sheet>(p, graph.id, (s) => (s.kind === "graph" ? fn(s) : s)),
      `graph:${graph.id}:${key}`);
  // Format Graph / Format Axes / annotations (src/graph): stored sparsely in
  // settings.format, validated on read.
  const format = useMemo(() => readFormat(graph.settings), [graph.settings]);
  const graphId = graph.id;
  const setFormat = useCallback((f: GraphFormat, t?: { x: string; y: string },
    key = "format") =>
    apply((p) => updateSheet<Sheet>(p, graphId, (s) => {
      if (s.kind !== "graph") return s;
      const { format: _old, ...rest } = s.settings;
      void _old;
      return { ...s, settings: { ...rest, ...(t ? { titles: t } : {}),
        ...(isDefaultFormat(f) ? {} : { format: f }) } };
    }), `graph:${graphId}:${key}`), [apply, graphId]);
  // Drags on the graph are their own undo steps, apart from dialog edits.
  const dragFormat = useCallback((f: GraphFormat) => setFormat(f, undefined, "drag"),
    [setFormat]);
  const ownDatasets = kind?.formatDatasets;
  const datasetNames = useMemo(() => (ownDatasets ? ownDatasets(table, graph, opts)
    : table.datasets.map((d) => d.name)), [ownDatasets, table, graph, opts]);
  const ownComparisons = kind?.comparisons;
  const comparisons = useMemo(() => (ownComparisons ? ownComparisons(res, table, opts) : undefined),
    [ownComparisons, res, table, opts]);
  const Options = kind?.OptionsPanel;
  const dialogs = useFormatDialogs({
    format, features: kind?.formatFeatures, datasets: datasetNames,
    hasRowTitles: table.rowTitles.some((r) => r.trim()), result: res,
    scheme: graph.settings.scheme, titles, autoTitles: auto, engineReady,
    onFormat: setFormat, comparisons,
  });

  return (
    <div className="plot-card">
      <div className="graph-head">
        <span className="graph-name">{graph.name}</span>
        {graph.frozen && (
          <span className="frozen-chip" title="Frozen: this graph no longer follows the data">
            <SnowflakeIcon /> Frozen
          </span>
        )}
        {siblings.length > 1 && !graph.frozen && !shared && (
          <select className="graph-select" aria-label="Graph type"
            value={graph.graphType}
            onChange={(e) => edit((g) => ({ ...g, graphType: e.target.value }), "type")}>
            {siblings.map((g) => <option key={g.id} value={g.id}>{g.label}</option>)}
          </select>
        )}
      </div>
      {Plot ? (
        <Suspense fallback={<div className="plot-pending" aria-busy="true" />}>
          <Plot graph={graph} table={table} options={opts} result={res}
            titles={resolved} scheme={graph.settings.scheme} format={format}
            onFormatChange={graph.frozen || shared ? undefined : dragFormat} />
        </Suspense>
      ) : <div className="plot empty-hint">No plot available for this graph type.</div>}
      <ExportPanel filename={fileStem(graph.name, kind?.exportName ?? "graph")}
        scheme={graph.settings.scheme} leading={graph.frozen || shared ? undefined : (
        <GraphSettings
          scheme={graph.settings.scheme}
          onSchemeChange={(id: SchemeId) => edit((g) => ({
            ...g, settings: { ...g.settings, scheme: id },
          }), "scheme")}
          titles={titles}
          onTitlesChange={(t) => edit((g) => ({ ...g, settings: { ...g.settings, titles: t } }),
            "titles")}
          autoX={auto.x} autoY={auto.y} showX={kind?.showXTitle !== false}
          actions={dialogs.actions} formatted={!isDefaultFormat(format)}
          figure={<FigurePanel format={format} scheme={graph.settings.scheme}
            onFormat={(f) => setFormat(f, undefined, "figure")} />}
          options={Options ? (
            <Suspense fallback={null}>
              <Options graph={graph} table={table} options={opts} result={res} />
            </Suspense>
          ) : undefined} />
      )} />
      <GraphLegend graph={graph} data={data} table={table} result={res} options={opts} />
      {dialogs.element}
    </div>
  );
}

function projectConstants(p: Project) {
  const out: { sheet: string; name: string; value: string }[] = [];
  for (const s of p.sheets) {
    if (s.kind !== "info") continue;
    for (const c of s.constants) {
      if (c.name.trim() && c.value.trim()) out.push({ sheet: s.name, name: c.name, value: c.value });
    }
  }
  return out;
}

function ConstantsList({ constants }: { constants: { sheet: string; name: string; value: string }[] }) {
  return (
    <details className="advanced constants-list">
      <summary>Info constants ({constants.length})</summary>
      <section>
        <p className="hint-block">
          From the project&apos;s info sheets. A user-formula Transform can
          use one as a constant (“Use an info constant…”) and follows its value.
        </p>
        <table className="results-table">
          <tbody>
            {constants.map((c, i) => (
              <tr key={i}><th>{c.name}</th><td>{c.value}</td></tr>
            ))}
          </tbody>
        </table>
      </section>
    </details>
  );
}
