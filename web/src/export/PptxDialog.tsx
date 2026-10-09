import { useMemo, useState } from "react";
import { useProject } from "../app/context";
import Modal from "../components/Modal";
import { findSheet } from "../project/ops";
import { PPTX_EDIT_HINT } from "./officeText";
import { pptxSheets, type PptxScope } from "./pptx";
import "../share/replay.css";


/** Scopes the dialog offers, from the sheet the user is on. */
function choices(p: ReturnType<typeof useProject>["project"], from: string | null | undefined):
  { scope: PptxScope; label: string }[] {
  const out: { scope: PptxScope; label: string }[] = [];
  const count = (s: PptxScope) => pptxSheets(p, s).length;
  const all = count({ kind: "all" });
  const layouts = p.sheets.filter((s) => s.kind === "layout").length;
  out.push({ scope: { kind: "all" }, label: `Every graph${layouts ? " and page layout" : ""} `
    + `(${all} slide${all === 1 ? "" : "s"})` });
  const s = findSheet(p, from);
  if (s?.kind === "layout") out.push({ scope: { kind: "layout", layoutId: s.id }, label: `This layout: “${s.name}”` });
  const dataId = s?.kind === "data" ? s.id : s?.kind === "results" || s?.kind === "graph" ? s.parentId : null;
  const data = findSheet(p, dataId);
  if (data?.kind === "data") {
    const n = count({ kind: "family", dataId: data.id });
    if (n) out.push({ scope: { kind: "family", dataId: data.id },
      label: `Graphs of “${data.name}” (${n} slide${n === 1 ? "" : "s"})` });
  }
  if (s?.kind === "graph") out.push({ scope: { kind: "graph", graphId: s.id }, label: `This graph: “${s.name}”` });
  return out;
}

const key = (s: PptxScope) => JSON.stringify(s);

/**
 * "Export graphs to PowerPoint (.pptx)…": choose all graphs and layouts,
 * this family's graphs, or this graph, and whether the figure legends go
 * into the slide notes.
 */
export default function PptxDialog({ from, initial, onClose, onExport }: {
  /** The sheet the command came from (offers its family / itself). */
  from?: string | null;
  initial?: PptxScope;
  onClose: () => void;
  onExport: (scope: PptxScope, o: { notes: boolean }) => void;
}) {
  const { project, selectedId } = useProject();
  const list = useMemo(() => choices(project, from ?? selectedId), [project, from, selectedId]);
  const [pick, setPick] = useState(() => {
    const want = initial ? key(initial) : "";
    return list.find((c) => key(c.scope) === want) ? want : key(list[list.length - 1].scope);
  });
  const [notes, setNotes] = useState(true);
  const chosen = list.find((c) => key(c.scope) === pick)?.scope ?? { kind: "all" as const };
  const empty = !pptxSheets(project, chosen).length;
  return (
    <Modal title="Export graphs to PowerPoint" className="pptx-dialog" onClose={onClose}
      onSubmit={() => { if (!empty) onExport(chosen, { notes }); }}
      actions={(
        <>
          <button type="button" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn-primary" disabled={empty}>Export .pptx</button>
        </>
      )}>
      <fieldset className="field-radios">
        <legend>Slides</legend>
        {list.map((c) => (
          <label key={key(c.scope)}>
            <input type="radio" name="pptx-scope" checked={pick === key(c.scope)}
              onChange={() => setPick(key(c.scope))} />
            {c.label}
          </label>
        ))}
      </fieldset>
      <label className="pptx-check">
        <input type="checkbox" checked={notes} onChange={(e) => setNotes(e.target.checked)} />
        Put each figure legend in the slide notes
      </label>
      <p className="field-note">
        One 16:9 slide per graph, titled with the graph&apos;s name; a page layout
        keeps its page. Each graph is a vector picture (SVG, with a PNG copy for
        older versions). {PPTX_EDIT_HINT}
      </p>
      {empty && <p className="field-note" role="alert">There are no graphs to export yet.</p>}
    </Modal>
  );
}
