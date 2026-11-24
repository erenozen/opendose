// The History panel's record of where a table's values came from (P-76):
// the file (name, size, SHA-256), the recipe or import settings, how many
// cells were edited by hand since, whether Apply to new data re-runs the
// import, and the imports before it.
import { handEdits, handEditsText, type ImportRecord, type ImportSource } from "../project/importRecord";
import type { DataTableModel } from "../project/types";
import { describeSpec, normalizeSpec } from "../share/recipes/saved";
import { replayProblem } from "../share/recipes/reimport";
import { recipeLabel } from "../share/recipes/useSavedRecipes";

const MODE: Record<ImportRecord["mode"], string> = {
  new: "made a new table", replace: "replaced the table's values",
  append: "added rows below the last", insert: "added values at a cell",
};

const when = (iso: string) => (iso ? new Date(iso).toLocaleString() : "date not recorded");
const fileWords = (s: ImportSource) => (s.pasted ? "pasted text" : `“${s.name}”${s.worksheet ? `, worksheet “${s.worksheet}”` : ""}`);

function Source({ s }: { s: ImportSource }) {
  return (
    <li>
      {fileWords(s)}, {s.bytes.toLocaleString("en")} bytes, SHA-256{" "}
      <code className="hs-hash">{s.sha256}</code>
    </li>
  );
}

export default function ImportHistory({ rec, table }: { rec: ImportRecord; table: DataTableModel }) {
  const edits = handEdits(rec, table);
  const spec = normalizeSpec(rec.spec);
  const problem = replayProblem(rec);
  const first = rec.sources[0];
  return (
    <div className="history-step history-import">
      <h3>Imported from {rec.sources.length > 1 ? `${rec.sources.length} files` : fileWords(first)}</h3>
      <p className="hs-meta">
        {when(rec.at)} · {rec.basis}{rec.recipeName ? ` (saved recipe “${rec.recipeName}”)` : ""} · {MODE[rec.mode]}
      </p>
      <ul className="hs-list" aria-label="Files read">
        {rec.sources.map((s, i) => <Source key={i} s={s} />)}
      </ul>
      {spec && <p className="hs-line">Settings: {describeSpec(spec, recipeLabel).replace(/\.$/, "")}.</p>}
      <p className="hs-line" data-part="hand-edits">
        {handEditsText(edits).replace(/^./, (c) => c.toUpperCase())} since the import{edits.cells.length ? ":" : "."}
      </p>
      {edits.cells.length > 0 && (
        <ul className="hs-list" aria-label="Cells edited by hand">
          {edits.cells.map((c, i) => (
            <li key={i}>{c.where}: {c.before === "" ? "(blank)" : c.before} → {c.after === "" ? "(blank)" : c.after}</li>
          ))}
          {edits.count !== null && edits.count > edits.cells.length && (
            <li>and {edits.count - edits.cells.length} more</li>
          )}
        </ul>
      )}
      <p className="hs-line">
        {rec.how === "apply" || !problem
          ? `Apply to new data ${rec.how === "apply" ? "puts the next file into the table's own layout"
            : `re-runs ${rec.recipeName ? `the recipe “${rec.recipeName}”` : "these settings"} on the next file`}.`
          : `Apply to new data puts the next file into the table's own layout instead of re-running this import: ${problem}.`}
      </p>
      {rec.earlier?.length ? (
        <>
          <p className="hs-line">Earlier imports into this table, oldest first:</p>
          <ul className="hs-list" aria-label="Earlier imports">
            {rec.earlier.map((e, i) => (
              <li key={i}>
                {when(e.at)}: {e.sources.map(fileWords).join(", ")} ({e.basis}, {MODE[e.mode]}
                {e.sources[0] ? `, SHA-256 ${e.sources[0].sha256.slice(0, 12)}…` : ""});
                {" "}{e.editedCells === null ? "cells edited by hand after it not counted"
                  : `${e.editedCells} cell${e.editedCells === 1 ? "" : "s"} edited by hand after it`}
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </div>
  );
}
