// SuperPlot section of a graph's options (column and grouped graphs): the
// mode, which values belong to which experiment (stored on the table),
// how experiments are drawn, and "Statistics on replicate means", which
// adds that analysis and binds this graph to it so its brackets land on
// the SuperPlot.
import { useProject } from "../../app/context";
import { OptCheck, OptNote, OptSelect } from "../../components/GraphOptionControls";
import { readFormat, withField } from "../../graph/format";
import { newId } from "../../project/ids";
import {
  addSheets, familyChildren, findSheet, makeResultsSheet, uniqueName, updateSheet, updateTable,
} from "../../project/ops";
import type {
  DataSheet, DataTableModel, GraphSheet, ReplicateMap, Sheet,
} from "../../project/types";
import { analysisDef } from "../registry";
import {
  isReplicateMeansResult, normalizeSuperPlot, replicateInfo, type SuperPlotSettings,
} from "./superplot";

const letter = (k: number) => String.fromCharCode(65 + (k % 26)) + (k >= 26 ? String(Math.floor(k / 26)) : "");

export default function SuperPlotOptions({ graph, table, result, s, on, onChange,
  analysis, settingsKey }: {
  graph: GraphSheet;
  table: DataTableModel;
  result: unknown;
  s: SuperPlotSettings;
  on: boolean;
  onChange: (s: SuperPlotSettings) => void;
  /** The replicate-means analysis of this table type. */
  analysis: string;
  /** Where the graph keeps its settings ("column" / "grouped"). */
  settingsKey: string;
}) {
  const { apply, project, select } = useProject();
  const set = (patch: Partial<SuperPlotSettings>) => onChange({ ...s, ...patch });
  const info = replicateInfo(table);
  const map: ReplicateMap = table.replicates ?? { by: "subcolumns" };
  const idColumn = table.type === "column" && table.datasets.length > 1;
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
    const a = data?.kind === "data" ? analysisDef(data.table.type, analysis) : undefined;
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
        const own = (g.settings[settingsKey] ?? {}) as Record<string, unknown>;
        const f = readFormat(g.settings);
        const format = withField(f, "comparisons", { ...(f.comparisons ?? {}), show: true });
        return { ...g, resultsId: id, settings: { ...g.settings, format,
          [settingsKey]: { ...own, superplot: { ...normalizeSuperPlot(own.superplot), on: true } } } };
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
          {idColumn && <OptSelect label="Experiments are" value={map.by === "column"
            ? "column" : "subcolumns"}
            options={[["subcolumns", "Subcolumns of each group"],
              ["column", "Labels in a data set (long format)"]]}
            onChange={(by) => editMap(by === "subcolumns" ? undefined
              : { by: "column", column: table.datasets.length - 1 })} />}
          {map.by === "column" && idColumn ? (
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
