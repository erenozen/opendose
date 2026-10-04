// "Assign replicates…": the dialog the guidance chip "n might be cells, not
// replicates" (and Reporting details) offers. It edits the table's
// replicate map (DataTableModel.replicates) with the same fields as a
// graph's SuperPlot options (ReplicateMapFields.tsx), can add an
// "Experiment" label data set to a column table, and turns the family's
// graphs into SuperPlots. The map feeds SuperPlots, statistics on
// replicate means and the figure legend's "n = 18 cells from 3
// independent experiments" (src/report/replicates.ts).
import { useState } from "react";
import "./sheetKit.css";
import { useProject } from "../../app/context";
import { OptCheck, OptInput, OptNote } from "../../components/GraphOptionControls";
import Modal from "../../components/Modal";
import { updateSheet, updateTable } from "../../project/ops";
import type { DataSheet, GraphSheet, ReplicateMap, Sheet } from "../../project/types";
import { labelDataset, normalizeSuperPlot, UNIT_CHOICES } from "./superplot";
import { ReplicateMapFields } from "./ReplicateMapFields";

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
