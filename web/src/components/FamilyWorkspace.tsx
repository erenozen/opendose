import { useCallback, useMemo, useRef } from "react";
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
import ColumnSplitter from "./ColumnSplitter";
import ExportPanel from "./ExportPanel";
import GraphSettings from "./GraphSettings";
import { GenericMethodsText } from "./MethodsText";
import HSplitter from "./HSplitter";
import { SnowflakeIcon } from "./SheetIcon";
import WelcomePanel from "./WelcomePanel";

/**
 * The workbench for one family: the data table (left) with the active
 * analysis' parameters under it, and the active graph, results and methods
 * text (right). Which results / graph sheet is active follows the
 * navigator selection and the analysis tabs in the header.
 */
export default function FamilyWorkspace({ data }: { data: DataSheet }) {
  const api = useProject();
  const { project, apply, engineReady, status, engineError, bootEngine } = api;
  const cmd = useCommands();
  const mainRef = useRef<HTMLElement>(null);
  const def = tableDef(data.table.type);
  const resSheet = api.activeResults(data.id);
  const graph = api.activeGraph(data.id);
  const aDef = resSheet ? analysisDef(data.table.type, resSheet.analysis) : undefined;

  const { result, options } = useAnalysisResult(resSheet, data.table);
  // A graph may draw from a results sheet other than the active one.
  const graphRes = graph?.resultsId && graph.resultsId !== resSheet?.id
    ? findSheet(project, graph.resultsId) as ResultsSheet | undefined : undefined;
  const other = useAnalysisResult(graphRes ?? null, graphRes ? data.table : null);

  // The engine-ready reveal animates once per session.
  const reveal = engineReady && !api.switchedRef.current ? " reveal" : "";

  const onTableChange: TableEdit = (fn, key) =>
    apply((p) => updateTable(p, data.id, fn), key ? `table:${key}` : null);

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
  const readOnly = !!data.frozen || !!data.derived;
  // Table types whose editor is final but whose analyses are not out yet.
  const entryOnly = def.status === "entry-only" || !def.analyses.length;
  const Editor = def.Editor;
  const Aside = def.EditorAside;
  const Controls = aDef?.ControlsPanel ?? def.ControlsPanel;
  const Results = aDef?.ResultsPanel ?? def.ResultsPanel;
  // Analyses without their own methods text get a generic, correct one.
  const Methods = aDef?.MethodsPanel ?? (aDef ? GenericMethodsText : undefined);

  const constants = useMemo(() => projectConstants(project), [project]);

  return (
    <main ref={mainRef}>
      {/* Until the engine is up, the editor column is inert: typing into a
          table that cannot analyze yet only causes confusion (and competes
          with the runtime for the main thread). */}
      <div className="left" inert={!engineReady}>
        {Aside && !readOnly && (
          <>
            <div className="pane pane-import">
              <Aside sheet={data} table={data.table} readOnly={readOnly}
                onChange={onTableChange} editFamily={editFamily} />
            </div>
            <HSplitter />
          </>
        )}
        <div className="pane pane-table">
          {data.frozen && (
            <FrozenNote what="data table" onUnfreeze={() => cmd.toggleFreeze(data.id)} />
          )}
          <OriginNote data={data} />
          <Editor sheet={data} table={data.table} readOnly={readOnly}
            onChange={onTableChange} />
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
                  <div className="controls-wrap" inert={!!resSheet.frozen}>
                    <Controls sheet={resSheet} table={data.table} options={options}
                      readOnly={!!resSheet.frozen}
                      onChange={(o) => apply((p) => updateResultsOptions(p, resSheet.id, () => o),
                        `options:${resSheet.id}`)} />
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
        {!engineReady ? (
          <div className="pane pane-plot">
            <WelcomePanel status={status} error={engineError} onRetry={bootEngine} />
          </div>
        ) : (
          <>
            {graph && (
              <>
                <div className={`pane pane-plot${reveal}`}>
                  <GraphCard graph={graph} data={data}
                    result={graph.resultsId === resSheet?.id ? result : other.result}
                    options={graph.resultsId === resSheet?.id ? options : other.options} />
                </div>
                <HSplitter />
              </>
            )}
            {resSheet && Results && (
              <div className={`pane pane-results${reveal}`}>
                <ResultsExport name={resSheet.name}>
                  <Results sheet={resSheet} table={data.table} options={options} result={result} />
                </ResultsExport>
              </div>
            )}
            {resSheet && Methods && (
              <>
                <HSplitter />
                <div className="pane pane-methods">
                  <Methods sheet={resSheet} table={data.table} options={options} result={result} />
                </div>
              </>
            )}
            {entryOnly ? (
              <div className={`pane pane-results${reveal}`}>
                <PlaceholderPanel label={def.label} hint={def.entryHint} />
              </div>
            ) : !graph && !resSheet && (
              <div className="pane pane-results">
                <p className="empty-hint result-card">
                  No results or graphs for this table yet.
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
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
  const { apply, engineReady } = useProject();
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
  const siblings = kind ? def.graphs.filter((g) => g.group === kind.group) : [];
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
  const datasetNames = useMemo(() => table.datasets.map((d) => d.name), [table.datasets]);
  const dialogs = useFormatDialogs({
    format, features: kind?.formatFeatures, datasets: datasetNames,
    hasRowTitles: table.rowTitles.some((r) => r.trim()), result: res,
    scheme: graph.settings.scheme, titles, autoTitles: auto, engineReady,
    onFormat: setFormat,
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
        {siblings.length > 1 && !graph.frozen && (
          <select className="graph-select" aria-label="Graph type"
            value={graph.graphType}
            onChange={(e) => edit((g) => ({ ...g, graphType: e.target.value }), "type")}>
            {siblings.map((g) => <option key={g.id} value={g.id}>{g.label}</option>)}
          </select>
        )}
      </div>
      {Plot ? (
        <Plot graph={graph} table={table} options={opts} result={res}
          titles={resolved} scheme={graph.settings.scheme} format={format}
          onFormatChange={graph.frozen ? undefined : dragFormat} />
      ) : <div className="plot empty-hint">No plot available for this graph type.</div>}
      <ExportPanel filename={fileStem(graph.name, kind?.exportName ?? "graph")}
        scheme={graph.settings.scheme} leading={graph.frozen ? undefined : (
        <GraphSettings
          scheme={graph.settings.scheme}
          onSchemeChange={(id: SchemeId) => edit((g) => ({
            ...g, settings: { ...g.settings, scheme: id },
          }), "scheme")}
          titles={titles}
          onTitlesChange={(t) => edit((g) => ({ ...g, settings: { ...g.settings, titles: t } }),
            "titles")}
          autoX={auto.x} autoY={auto.y} showX={kind?.showXTitle !== false}
          actions={dialogs.actions} formatted={!isDefaultFormat(format)} />
      )} />
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
