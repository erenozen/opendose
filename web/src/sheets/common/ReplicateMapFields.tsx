// The replicate-map fields (which values belong to which experiment, and
// what one value is): shared by a graph's SuperPlot options and the
// "Assign replicates…" dialog (ReplicateAssign.tsx).
import { OptInput, OptNote, OptSelect } from "../../components/GraphOptionControls";
import type { DataTableModel, ReplicateMap } from "../../project/types";
import { replicateInfo } from "./superplot";

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
