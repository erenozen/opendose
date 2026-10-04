// Which values belong to which biological replicate (experiment): the
// replicate map of a column or grouped table (DataTableModel.replicates).
// One set of fields, used by the SuperPlot section of a graph's options
// and by the "Assign replicates…" dialog that the guidance chip "n might be
// cells, not replicates" offers. The map feeds SuperPlots, statistics on
// replicate means and the figure legend's "n = 18 cells from 3
// independent experiments" (src/report/replicates.ts).
import { useState } from "react";
import "./sheetKit.css";
import { useProject } from "../../app/context";
import { OptInput, OptNote, OptSelect, OptCheck } from "../../components/GraphOptionControls";
import Modal from "../../components/Modal";
import { updateSheet, updateTable } from "../../project/ops";
import type { DataSheet, DataTableModel, GraphSheet, ReplicateMap, Sheet } from "../../project/types";
import { labelDataset, normalizeSuperPlot, replicateInfo, UNIT_CHOICES } from "./superplot";

const letter = (k: number) => String.fromCharCode(65 + (k % 26)) + (k >= 26 ? String(Math.floor(k / 26)) : "");

export function ReplicateMapFields({ table, map, onMap, showUnit = true }: {
  table: DataTableModel;
  map: ReplicateMap;
  /** undefined: back to the default (each subcolumn is one experiment). */
  onMap: (next: ReplicateMap | undefined) => void;
  /** Offer the "Each value is one …" field. */
  showUnit?: boolean;
}) {
  const info = replicateInfo({ ...table, replicates: map });
  const idColumn = table.type === "column" && table.datasets.length > 1;
  const nSub = Math.max(1, ...table.datasets.map((d) => d.rows[0]?.length ?? 1));
  const keep = (next: ReplicateMap) => (map.unit ? { ...next, unit: map.unit } : next);
  return (
    <>
      {idColumn && <OptSelect label="Experiments are" value={map.by === "column"
        ? "column" : "subcolumns"}
        options={[["subcolumns", "Subcolumns of each group"],
          ["column", "Labels in a data set (long format)"]]}
        onChange={(by) => onMap(by === "subcolumns"
          ? (map.unit ? { by: "subcolumns", unit: map.unit } : undefined)
          : keep({ by: "column", column: table.datasets.length - 1 }))} />}
      {map.by === "column" && idColumn ? (
        <OptSelect label="Experiment labels in" value={String(info.idColumn ?? table.datasets.length - 1)}
          options={table.datasets.map((d, i) => [String(i), d.name || `Data set ${i + 1}`] as const)}
          onChange={(v) => onMap(keep({ by: "column", column: Number(v) }))} />
      ) : nSub > 1 ? (
        Array.from({ length: nSub }, (_, k) => (
          <OptSelect key={k} label={`Subcolumn ${letter(k)} is`}
            value={String(map.of?.[k] ?? k)}
            options={Array.from({ length: nSub }, (_, r) =>
              [String(r), map.names?.[r]?.trim() || `Experiment ${r + 1}`] as const)}
            onChange={(v) => {
              const of = Array.from({ length: nSub }, (_, i) => map.of?.[i] ?? i);
              of[k] = Number(v);
              onMap({ ...map, by: "subcolumns", of });
            }} />
        ))
      ) : (
        <OptNote>Enter each experiment&apos;s values in its own subcolumn (Change → number
          of subcolumns), or put experiment labels in a data set of their own.</OptNote>
      )}
      {showUnit && (
        <OptInput label="Each value is one" value={map.unit ?? ""} placeholder="value"
          onChange={(v) => onMap({ ...map, unit: v.trim() ? v.slice(0, 60) : undefined })} />
      )}
      <OptNote>
        {info.names.length} experiment{info.names.length === 1 ? "" : "s"}: {info.names.join(", ")}.
      </OptNote>
    </>
  );
}

/** The dialog behind the guidance chip's "Assign replicates…". */
export default function AssignReplicatesDialog({ dataId, onClose }: {
  dataId: string; onClose: () => void;
}) {
  const { project, apply, readOnly } = useProject();
  const data = project.sheets.find((s) => s.id === dataId) as DataSheet | undefined;
  const table = data?.kind === "data" ? data.table : null;
  const longFormat = table?.type === "column";
  // A data set holding text (not numbers) is taken for the experiment labels.
  const labelSet = table && longFormat ? labelDataset(table) : -1;
  const [map, setMap] = useState<ReplicateMap>(() => table?.replicates
    ?? (labelSet >= 0 ? { by: "column", column: labelSet, unit: "cells" }
      : { by: "subcolumns", unit: "cells" }));
  const [addColumn, setAddColumn] = useState(() => longFormat && !table?.replicates && labelSet < 0);
  const [superplot, setSuperplot] = useState(true);
  if (!data || !table) return null;
  const graphs = project.sheets.filter((s): s is GraphSheet => s.kind === "graph"
    && s.parentId === dataId && !s.frozen
    && ["scatter", "bar", "box", "violin", "grouped_interleaved", "grouped_separated",
      "grouped_scatter"].includes(s.graphType));
  const save = () => {
    apply((p) => {
      let q = updateTable(p, dataId, (t) => {
        const out = { ...t };
        if (addColumn) {
          out.datasets = [...t.datasets, { name: "Experiment",
            rows: t.datasets[0].rows.map(() => [""]) }];
          out.replicates = { by: "column", column: out.datasets.length - 1,
            ...(map.unit ? { unit: map.unit } : {}) };
        } else {
          out.replicates = map;
        }
        return out;
      });
      if (superplot) {
        for (const g of graphs) {
          const key = g.graphType.startsWith("grouped_") ? "grouped" : "column";
          q = updateSheet<Sheet>(q, g.id, (s) => {
            if (s.kind !== "graph") return s;
            const own = (s.settings[key] ?? {}) as Record<string, unknown>;
            return { ...s, settings: { ...s.settings,
              [key]: { ...own, superplot: { ...normalizeSuperPlot(own.superplot), on: true } } } };
          });
        }
      }
      return q;
    }, `table:replicates:${dataId}`);
    onClose();
  };
  return (
    <Modal title={`Assign replicates: ${data.name}`} onClose={onClose}
      onSubmit={readOnly ? undefined : save}
      actions={(
        <>
          <button type="button" onClick={onClose}>Cancel</button>
          <button type="submit" className="primary" disabled={readOnly}>Save</button>
        </>
      )}>
      <div className="replicate-assign">
        <p className="hint-block">
          Say which values come from which independent experiment (or animal). The figure
          legend then reads “n = 18 cells from 3 independent experiments”, a SuperPlot
          colours the values by experiment, and “Statistics on replicate means” (graph
          settings → SuperPlot) tests one value per experiment.
        </p>
        <div className="graph-opts-section">
          {longFormat && (
            <OptCheck label="Add an “Experiment” data set for the labels (then type E1, E2, … on each row)"
              checked={addColumn} onChange={setAddColumn} />
          )}
          {addColumn ? (
            <OptInput label="Each value is one" value={map.unit ?? ""} placeholder="value"
              onChange={(v) => setMap({ ...map, unit: v.trim() ? v.slice(0, 60) : undefined })} />
          ) : (
            <ReplicateMapFields table={table} map={map} onMap={(m) => setMap(m ?? { by: "subcolumns" })} />
          )}
          <OptNote>Common units: {UNIT_CHOICES.join(", ")}.</OptNote>
          {graphs.length > 0 && (
            <OptCheck label={`Show ${graphs.length === 1 ? "the graph" : "the graphs"} as a SuperPlot`}
              checked={superplot} onChange={setSuperplot} />
          )}
        </div>
      </div>
    </Modal>
  );
}
