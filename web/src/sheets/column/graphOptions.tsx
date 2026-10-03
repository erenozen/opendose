// Graph options of the column graphs (Settings panel): centre and error
// bars, how points spread, points on bars (with the small-n advice), the
// legend sentence, and SuperPlot mode with its replicate assignment and
// "Statistics on replicate means".
import { useProject } from "../../app/context";
import {
  OptCheck, OptNote, OptSelect,
} from "../../components/GraphOptionControls";
import { readFormat, withField } from "../../graph/format";
import { POINT_SPREADS } from "../../graph/swarm";
import { newId } from "../../project/ids";
import {
  addSheets, familyChildren, findSheet, makeResultsSheet, uniqueName, updateSheet, updateTable,
} from "../../project/ops";
import type {
  DataSheet, DataTableModel, GraphSheet, ReplicateMap, Sheet,
} from "../../project/types";
import { analysisDef } from "../registry";
import type { GraphOptionsProps } from "../types";
import {
  isReplicateMeansResult, replicateInfo, superPlotOn, type SuperPlotSettings,
} from "../common/superplot";
import { useGraphSetting } from "../grouped/plotting";
import {
  CAPTION_LABELS, COLUMN_SUMMARY_LABELS, normalizeColumnGraph, smallestN,
  type ColumnGraphSettings, type ColumnSummary,
} from "./graphSettings";
import { ANALYSIS_REPLICATE_MEANS } from "./superplotStats";
import "../../graph/figure.css";

const letter = (k: number) => String.fromCharCode(65 + (k % 26)) + (k >= 26 ? String(Math.floor(k / 26)) : "");

/** "Journals ask to show the points for n < 10", with a one-click fix. */
export function SmallNAdvice({ n, onShow }: { n: number; onShow: () => void }) {
  return (
    <p className="gopt-advice" role="note">
      <span>
        Journals ask to show the points for n &lt; 10 (smallest group here: n = {n}; see{" "}
        <a href="https://doi.org/10.1371/journal.pbio.1002128" target="_blank" rel="noreferrer">
          Weissgerber et al. 2015</a>,{" "}
        <a href="https://doi.org/10.1038/s41551-017-0079" target="_blank" rel="noreferrer">
          “Show the dots in plots”</a>).
      </span>
      <button type="button" onClick={onShow}>Show points</button>
    </p>
  );
}

export function ColumnGraphOptions({ graph, table, result }: GraphOptionsProps) {
  const [s, set] = useGraphSetting(graph, "column", normalizeColumnGraph);
  if (!set) return null;
  const up = (patch: Partial<ColumnGraphSettings>) => set({ ...s, ...patch });
  const kind = graph.graphType;
  const raw = table.subcolumnFormat === "replicates";
  const superOn = raw && superPlotOn(s.superplot, result);
  const summaryKinds = kind === "scatter" || kind === "bar";
  const pointsDrawn = kind === "scatter" || (kind === "bar" && s.points) || superOn;
  const n = smallestN(table);
  return (
    <>
      {raw && summaryKinds && !superOn && (
        <OptSelect label={kind === "bar" ? "Bars and error bars" : "Centre and error bars"}
          value={s.summary}
          options={(Object.keys(COLUMN_SUMMARY_LABELS) as ColumnSummary[])
            .map((k) => [k, COLUMN_SUMMARY_LABELS[k]] as const)}
          onChange={(summary) => up({ summary })} />
      )}
      {raw && kind === "bar" && !superOn && (
        <OptCheck label="Show individual values on the bars" checked={s.points}
          onChange={(points) => up({ points })} />
      )}
      {raw && kind === "bar" && !s.points && !superOn && n > 0 && n < 10 && (
        <SmallNAdvice n={n} onShow={() => up({ points: true })} />
      )}
      {raw && pointsDrawn && kind !== "box" && kind !== "violin" && (
        <OptSelect label="Point layout" value={s.spread} options={POINT_SPREADS}
          onChange={(spread) => up({ spread })} />
      )}
      <OptSelect label="Legend sentence" value={s.caption} options={CAPTION_LABELS}
        onChange={(caption) => up({ caption })}
        title="Error-bar meaning and n per group, as journals ask for in the figure legend" />
      {raw && table.type === "column" && <SuperPlotOptions graph={graph} table={table} result={result} s={s.superplot}
        on={superOn} onChange={(superplot) => up({ superplot })} />}
    </>
  );
}

// ------------------------------------------------------------ SuperPlot

function SuperPlotOptions({ graph, table, result, s, on, onChange }: {
  graph: GraphSheet;
  table: DataTableModel;
  result: unknown;
  s: SuperPlotSettings;
  on: boolean;
  onChange: (s: SuperPlotSettings) => void;
}) {
  const { apply, project, select } = useProject();
  const set = (patch: Partial<SuperPlotSettings>) => onChange({ ...s, ...patch });
  const info = replicateInfo(table);
  const map: ReplicateMap = table.replicates ?? { by: "subcolumns" };
  const nSub = Math.max(1, ...table.datasets.map((d) => d.rows[0]?.length ?? 1));
  const editMap = (next: ReplicateMap | undefined) => apply((p) => updateTable(p, graph.parentId,
    (t) => {
      const out = { ...t };
      if (next) out.replicates = next; else delete out.replicates;
      return out;
    }), `table:replicates:${graph.parentId}`);
  const bound = isReplicateMeansResult(result);
  const boundSheet = graph.resultsId ? findSheet(project, graph.resultsId) : undefined;

  const addStats = () => {
    const data = findSheet(project, graph.parentId) as DataSheet | undefined;
    const a = analysisDef("column", ANALYSIS_REPLICATE_MEANS);
    if (!data || data.kind !== "data" || !a) return;
    const id = newId();
    const res = makeResultsSheet(id, data.id, a.id,
      a.defaultOptions({ table: data.table, prefs: project.prefs }),
      uniqueName(project, a.sheetName(data.name)));
    apply((p) => {
      const kids = familyChildren(p, data.id);
      let q = addSheets(p, [res], kids.length ? kids[kids.length - 1].id : data.id);
      q = updateSheet<Sheet>(q, graph.id, (g) => {
        if (g.kind !== "graph") return g;
        const col = normalizeColumnGraph(g.settings.column);
        const f = readFormat(g.settings);
        const format = withField(f, "comparisons", { ...(f.comparisons ?? {}), show: true });
        return { ...g, resultsId: id, settings: { ...g.settings, format,
          column: { ...col, superplot: { ...col.superplot, on: true } } } };
      });
      return q;
    }, `superplot-stats:${graph.id}`);
    select(id);
  };

  return (
    <>
      <p className="gopt-sub">SuperPlot</p>
      <OptCheck label="Colour every point by experiment (SuperPlot)" checked={on}
        onChange={(v) => set({ on: v })}
        title="Lord et al. 2020, J Cell Biol: show each biological replicate and test on replicate means" />
      {on && (
        <>
          <OptSelect label="Experiments are" value={map.by === "column" && table.datasets.length > 1
            ? "column" : "subcolumns"}
            options={[["subcolumns", "Subcolumns of each group"],
              ["column", "Labels in a data set (long format)"]]}
            onChange={(by) => editMap(by === "subcolumns" ? undefined
              : { by: "column", column: table.datasets.length - 1 })} />
          {map.by === "column" && table.datasets.length > 1 ? (
            <OptSelect label="Experiment labels in" value={String(info.idColumn ?? table.datasets.length - 1)}
              options={table.datasets.map((d, i) => [String(i), d.name || `Data set ${i + 1}`] as const)}
              onChange={(v) => editMap({ by: "column", column: Number(v) })} />
          ) : nSub > 1 ? (
            Array.from({ length: nSub }, (_, k) => (
              <OptSelect key={k} label={`Subcolumn ${letter(k)} is`}
                value={String(map.of?.[k] ?? k)}
                options={Array.from({ length: nSub }, (_, r) =>
                  [String(r), map.names?.[r]?.trim() || `Experiment ${r + 1}`] as const)}
                onChange={(v) => {
                  const of = Array.from({ length: nSub }, (_, i) => map.of?.[i] ?? i);
                  of[k] = Number(v);
                  editMap({ ...map, by: "subcolumns", of });
                }} />
            ))
          ) : (
            <OptNote>Enter each experiment&apos;s values in its own subcolumn (Change → number
              of subcolumns), or put experiment labels in a data set of their own.</OptNote>
          )}
          <OptNote>
            {info.names.length} experiment{info.names.length === 1 ? "" : "s"}: {info.names.join(", ")}.
          </OptNote>
          <OptSelect label="Each experiment's symbol" value={s.center}
            options={[["mean", "Mean"], ["median", "Median"]]}
            onChange={(center) => set({ center })} />
          <OptSelect label="Line and error bars" value={s.error}
            options={[["sd", "Mean ± SD of experiment means"], ["sem", "Mean ± SEM of experiment means"],
              ["ci", "Mean with 95% CI"], ["none", "Mean only"]]}
            onChange={(error) => set({ error })} />
          <OptSelect label="Tell experiments apart by" value={s.encode}
            options={[["both", "Colour and symbol"], ["color", "Colour"], ["shape", "Symbol (no colour)"]]}
            onChange={(encode) => set({ encode })} />
          <OptCheck label="Join each experiment's means across groups" checked={s.link}
            onChange={(link) => set({ link })} />
          <div className="gopt-actions">
            {bound && boundSheet ? (
              <button type="button" onClick={() => select(boundSheet.id)}>
                Open “{boundSheet.name}”</button>
            ) : (
              <button type="button" disabled={info.names.length < 2 || graph.frozen}
                onClick={addStats}>Statistics on replicate means</button>
            )}
          </div>
          {!bound && (
            <OptNote>Runs the test on one value per experiment (n = {info.names.length}) and
              puts its brackets on this graph.</OptNote>
          )}
        </>
      )}
    </>
  );
}
