// Annotations: text boxes, lines, arrows, rectangles, ellipses and live
// results blocks drawn on the graph. Each can also be dragged on the graph
// itself; the new position is saved with the graph.
import { useState } from "react";
import Modal from "../components/Modal";
import { CHROME_DARK, CHROME_LIGHT, isDarkMode } from "../lib/palette";
import {
  LINE_DASHES, newAnnotationId, withField, type Annotation, type GraphFormat,
  type ResultsBlock,
} from "./format";
import {
  CheckField, ColorField, DialogActions, NumField, SelectField, TextField,
} from "./controls";

type DistOmit<T> = T extends unknown ? Omit<T, "id"> : never;

const KIND_LABELS: Record<Annotation["kind"], string> = {
  text: "Text", line: "Line", arrow: "Arrow", rect: "Rectangle", ellipse: "Ellipse",
  results: "Results",
};
const BLOCK_LABELS: Record<ResultsBlock, string> = {
  params: "Best-fit values / summary", equation: "Equation", pvalue: "P value",
};

export default function AnnotationsDialog({ format, results, paperOnly, onApply, onClose }: {
  format: GraphFormat;
  /** The graph has no X/Y axes (pie charts, heat maps): plot-area
   *  coordinates only. */
  paperOnly?: boolean;
  /** Results blocks available for this graph (empty strings omitted). */
  results: Partial<Record<ResultsBlock, string>>;
  onApply: (f: GraphFormat) => void;
  onClose: () => void;
}) {
  const [list, setList] = useState<Annotation[]>(format.annotations ?? []);
  const [applied, setApplied] = useState(format.annotations ?? []);
  const chrome = isDarkMode() ? CHROME_DARK : CHROME_LIGHT;
  const update = (i: number, patch: Partial<Annotation>) =>
    setList((l) => l.map((a, j) => (j === i ? { ...a, ...patch } as Annotation : a)));
  const add = (a: DistOmit<Annotation>) =>
    setList((l) => [...l, { ...a, id: newAnnotationId(l) } as Annotation]);
  const commit = (l: Annotation[]) => withField(format, "annotations", l.length ? l : undefined);
  const dirty = JSON.stringify(list) !== JSON.stringify(applied);
  const available = (Object.keys(BLOCK_LABELS) as ResultsBlock[]).filter((b) => results[b]);

  return (
    <Modal title="Annotations" className="modal-wide fmt-dialog" onClose={onClose}
      onSubmit={() => { if (dirty) onApply(commit(list)); onClose(); }}
      actions={<DialogActions onCancel={onClose}
        onApply={() => { onApply(commit(list)); setApplied(list); }} dirty={dirty} />}>
      <div className="fmt-add-row" role="group" aria-label="Add an annotation">
        <button type="button" className="fmt-add"
          onClick={() => add({ kind: "text", text: "Text", x: 0.5, y: 0.92, ref: "paper" })}>
          Add text</button>
        <button type="button" className="fmt-add" onClick={() => add({ kind: "line", ref: "paper",
          x0: 0.25, y0: 0.85, x1: 0.55, y1: 0.85 })}>Add line</button>
        <button type="button" className="fmt-add" onClick={() => add({ kind: "arrow", ref: "paper",
          x0: 0.3, y0: 0.9, x1: 0.45, y1: 0.7 })}>Add arrow</button>
        <button type="button" className="fmt-add" onClick={() => add({ kind: "rect", ref: "paper",
          x0: 0.3, y0: 0.5, x1: 0.6, y1: 0.8 })}>Add rectangle</button>
        <button type="button" className="fmt-add" onClick={() => add({ kind: "ellipse", ref: "paper",
          x0: 0.3, y0: 0.5, x1: 0.6, y1: 0.8 })}>Add ellipse</button>
        {available.map((b) => (
          <button key={b} type="button" className="fmt-add" onClick={() => add({ kind: "results",
            what: b, x: 0.02, y: 0.98, ref: "paper", border: true,
            background: chrome.surface })}>Add {BLOCK_LABELS[b].toLowerCase()}</button>
        ))}
      </div>
      <p className="field-note">
        Drag text and arrows on the graph to move them; positions are saved
        with the graph. “Plot area” coordinates run from 0 to 1 across the
        plot{paperOnly ? "" : "; “data” coordinates follow the axes"}. Results
        blocks update when the analysis changes.
      </p>
      {list.length === 0 && <p className="empty-hint">No annotations on this graph.</p>}
      <ol className="fmt-ann-list">
        {list.map((a, i) => (
          <li key={a.id} className="fmt-section wide">
            <div className="fmt-ann-head">
              <strong>{KIND_LABELS[a.kind]}{a.kind === "results" ? `: ${BLOCK_LABELS[a.what]}` : ""}</strong>
              <button type="button" className="fmt-mini" onClick={() =>
                setList((l) => l.filter((_, j) => j !== i))}
                aria-label={`Remove ${KIND_LABELS[a.kind].toLowerCase()} ${i + 1}`}>Remove</button>
            </div>
            <div className="fmt-grid">
              {a.kind === "text" && (
                <TextField label="Text" multiline value={a.text}
                  onChange={(v) => update(i, { text: v ?? "" })} />
              )}
              {!paperOnly && (
                <SelectField label="Coordinates" value={a.ref}
                  options={[["paper", "Plot area (0-1)"], ["data", "Data (axis units)"]]}
                  onChange={(v) => update(i, { ref: v })} />
              )}
              {a.kind === "text" || a.kind === "results" ? (
                <>
                  <NumField label="X" value={a.x} onChange={(v) => update(i, { x: v ?? 0 })} />
                  <NumField label="Y" value={a.y} onChange={(v) => update(i, { y: v ?? 0 })} />
                  <NumField label="Text size" value={a.size} onChange={(v) => update(i, { size: v })} />
                  <ColorField label="Background" value={a.background} auto={chrome.surface}
                    surface={chrome.surface} mark={false}
                    onChange={(v) => update(i, { background: v })} />
                  <CheckField label="Border" checked={!!a.border}
                    onChange={(v) => update(i, { border: v || undefined })} />
                  {a.kind === "text" && (
                    <CheckField label="Arrow to the point (X, Y)" checked={!!a.arrow}
                      onChange={(v) => update(i, { arrow: v || undefined })} />
                  )}
                </>
              ) : (
                <>
                  <NumField label={a.kind === "arrow" ? "From X" : "X1"} value={a.x0}
                    onChange={(v) => update(i, { x0: v ?? 0 })} />
                  <NumField label={a.kind === "arrow" ? "From Y" : "Y1"} value={a.y0}
                    onChange={(v) => update(i, { y0: v ?? 0 })} />
                  <NumField label={a.kind === "arrow" ? "To X" : "X2"} value={a.x1}
                    onChange={(v) => update(i, { x1: v ?? 0 })} />
                  <NumField label={a.kind === "arrow" ? "To Y" : "Y2"} value={a.y1}
                    onChange={(v) => update(i, { y1: v ?? 0 })} />
                  <NumField label="Line width" value={a.width} onChange={(v) => update(i, { width: v })} />
                  {a.kind !== "arrow" && (
                    <SelectField label="Line style" value={a.dash ?? "solid"}
                      options={LINE_DASHES.map((d) => [d, d] as const)}
                      onChange={(v) => update(i, { dash: v === "solid" ? undefined : v })} />
                  )}
                  {(a.kind === "rect" || a.kind === "ellipse") && (
                    <ColorField label="Fill" value={a.fill} auto={chrome.surface}
                      surface={chrome.surface} mark={false}
                      onChange={(v) => update(i, { fill: v })} />
                  )}
                </>
              )}
              <ColorField label="Colour" value={a.color} auto={chrome.ink}
                surface={chrome.surface} onChange={(v) => update(i, { color: v })} />
            </div>
          </li>
        ))}
      </ol>
    </Modal>
  );
}
