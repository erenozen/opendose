import { lazy, Suspense, useState } from "react";
import { useProject } from "../../app/context";
import { findSheet } from "../../project/ops";
import type { ResultsSheet } from "../../project/types";
import type { LongTarget } from "./longTable";
import "./grid.css";

const LongTableDialog = lazy(() => import("./LongTableDialog"));

const HINTS: Record<LongTarget, string> = {
  cmh: "A file with one row per stratum, row and column level (and a count), or one row per subject.",
  roc: "A file with one row per subject: the marker value and the status.",
  quantal: "A file with one row per dose group: dose, number of subjects, responders (and a group).",
  xy: "A file with one row per point: data set, X and Y.",
};

/** "From long table…": fills the analysed data table from long records
 *  (LongTableDialog). Hidden for linked (derived) and frozen tables. */
export default function LongTableButton({ target, sheet }: { target: LongTarget; sheet: ResultsSheet }) {
  const { project, readOnly } = useProject();
  const [open, setOpen] = useState(false);
  const parent = findSheet(project, sheet.parentId);
  if (readOnly || sheet.frozen || !parent || parent.kind !== "data" || parent.derived || parent.frozen) {
    return null;
  }
  return (
    <div className="long-table-entry">
      <button type="button" onClick={() => setOpen(true)} title={HINTS[target]}>
        From long table…
      </button>
      {open && (
        <Suspense fallback={null}>
          <LongTableDialog target={target} sheet={sheet} onClose={() => setOpen(false)} />
        </Suspense>
      )}
    </div>
  );
}
