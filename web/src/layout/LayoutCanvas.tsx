import { useRef, useState, type RefObject } from "react";
import { legendSvg, letterSvg, textSvg } from "../export/compose";
import {
  clampRect, pageDims, panelLetters, PX_PER_MM, snapMove, snapResize,
  type LegendEntry, type ResolvedLayout,
} from "../project/layout";
import type { GraphSheet, LayoutItem, LayoutRect, Project } from "../project/types";
import LiveGraph from "./LiveGraph";

export interface CanvasProps {
  layout: ResolvedLayout;
  project: Project;
  readOnly: boolean;
  zoom: number;
  /** Colours of the composer view (follow the app theme). */
  ink: string;
  surface: string;
  selected: string | null;
  onSelect: (id: string | null) => void;
  /** Commit a new rectangle; `key` coalesces keyboard nudges into one undo step. */
  onRect: (id: string, rect: LayoutRect, key: string | null) => void;
  onRemove: (id: string) => void;
  onChooseGraph: (id: string) => void;
  legend: LegendEntry[];
  pageRef: RefObject<HTMLDivElement | null>;
}

interface Drag {
  id: string;
  mode: "move" | "resize";
  x: number;
  y: number;
  start: LayoutRect;
  others: LayoutRect[];
}

const px = (mm: number) => mm * PX_PER_MM;
const rectOf = (it: LayoutItem): LayoutRect => ({ x: it.x, y: it.y, w: it.w, h: it.h });

function itemLabel(it: LayoutItem, project: Project): string {
  if (it.kind === "graph") {
    const g = project.sheets.find((s) => s.id === it.graphId);
    return g ? `Graph “${g.name}”` : "Empty graph placeholder";
  }
  if (it.kind === "picture") return `Picture “${it.name}”`;
  if (it.kind === "text") return `Text “${it.text.slice(0, 30) || "empty"}”`;
  return "Master legend";
}

/**
 * The page itself, drawn at true size (1 mm = 3.78 CSS px) and scaled to
 * fit, so graphs lay out exactly as they will export. Items move by drag
 * or arrow keys (Shift: 10 mm) and resize from their corner handle or
 * with Alt+arrows; edges snap to margins, the page centre and other
 * items (hold Alt while dragging to place freely).
 */
export default function LayoutCanvas(props: CanvasProps) {
  const { layout, project, readOnly, zoom, ink, surface, selected, legend, pageRef } = props;
  const { w, h } = pageDims(layout.page);
  const [draft, setDraft] = useState<{ id: string; rect: LayoutRect } | null>(null);
  const drag = useRef<Drag | null>(null);
  const letters = panelLetters(layout.items, layout.letters);

  const begin = (e: React.PointerEvent, it: LayoutItem, mode: Drag["mode"]) => {
    if (readOnly || e.button !== 0) return;
    if ((e.target as HTMLElement).closest("button, input, select, textarea, a")) return;
    e.preventDefault();
    e.stopPropagation();
    props.onSelect(it.id);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    (e.currentTarget as HTMLElement).closest<HTMLElement>(".layout-item")?.focus({ preventScroll: true });
    drag.current = {
      id: it.id, mode, x: e.clientX, y: e.clientY, start: rectOf(it),
      others: layout.items.filter((o) => o.id !== it.id).map(rectOf),
    };
  };
  const move = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dx = (e.clientX - d.x) / (zoom * PX_PER_MM);
    const dy = (e.clientY - d.y) / (zoom * PX_PER_MM);
    const free = e.altKey;
    const r = d.mode === "move"
      ? { ...d.start, x: d.start.x + dx, y: d.start.y + dy }
      : { ...d.start, w: d.start.w + dx, h: d.start.h + dy };
    const snapped = free ? clampRect(r, layout.page)
      : d.mode === "move" ? snapMove(r, layout.page, d.others)
        : snapResize(r, layout.page, d.others);
    setDraft({ id: d.id, rect: snapped });
  };
  const end = () => {
    const d = drag.current;
    drag.current = null;
    if (d && draft && draft.id === d.id) props.onRect(d.id, draft.rect, null);
    setDraft(null);
  };

  const onKey = (e: React.KeyboardEvent, it: LayoutItem) => {
    if (e.target !== e.currentTarget) return;
    if (e.key === "Escape") { props.onSelect(null); (e.currentTarget as HTMLElement).blur(); return; }
    if (readOnly) return;
    if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      props.onRemove(it.id);
      return;
    }
    const dir = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
    if (!dir) return;
    e.preventDefault();
    const step = e.shiftKey ? 10 : 1;
    const r = rectOf(it);
    const next = e.altKey
      ? { ...r, w: r.w + dir[0] * step, h: r.h + dir[1] * step }
      : { ...r, x: r.x + dir[0] * step, y: r.y + dir[1] * step };
    props.onRect(it.id, clampRect(next, layout.page), `${e.altKey ? "size" : "nudge"}:${it.id}`);
  };

  const bg = layout.page.background;
  const pageBg = bg === "transparent" ? undefined
    : bg.toLowerCase() === "#ffffff" ? surface : bg;

  const letterMarkup = [...letters.entries()].map(([id, label]) => {
    const it = layout.items.find((i) => i.id === id)!;
    const r = draft?.id === id ? draft.rect : it;
    return letterSvg(label, px(r.x), px(r.y), layout.letters, ink);
  }).join("");

  return (
    <div className="layout-stage" style={{ width: px(w) * zoom, height: px(h) * zoom }}>
      <div ref={pageRef}
        className={`layout-page${bg === "transparent" ? " is-transparent" : ""}`}
        style={{ width: px(w), height: px(h), transform: `scale(${zoom})`, background: pageBg,
          color: ink }}
        onPointerDown={(e) => { if (e.target === e.currentTarget) props.onSelect(null); }}
        aria-label={`Page, ${Math.round(w)} × ${Math.round(h)} mm`} role="region">
        <div className="layout-margin" aria-hidden="true" style={{
          inset: px(Math.min(layout.page.margin, w / 3, h / 3)) }} />
        {layout.items.map((it) => {
          const r = draft?.id === it.id ? draft.rect : it;
          const sel = selected === it.id;
          const graph = it.kind === "graph" && it.graphId
            ? project.sheets.find((s): s is GraphSheet => s.kind === "graph" && s.id === it.graphId)
            : undefined;
          return (
            <div key={it.id} data-item-id={it.id}
              className={`layout-item kind-${it.kind}${sel ? " selected" : ""}`
                + `${it.kind === "graph" && it.hideLegend ? " no-legend" : ""}`
                + `${it.kind === "graph" && !graph ? " is-empty" : ""}`}
              style={{ left: px(r.x), top: px(r.y), width: px(r.w), height: px(r.h) }}
              tabIndex={0} role="group"
              aria-label={`${itemLabel(it, project)}${letters.get(it.id) ? `, panel ${letters.get(it.id)}` : ""}`
                + (readOnly ? "" : ". Arrows move it, Alt+arrows resize, Delete removes")}
              aria-current={sel || undefined}
              onFocus={() => props.onSelect(it.id)}
              onKeyDown={(e) => onKey(e, it)}
              onPointerDown={(e) => begin(e, it, "move")}
              onPointerMove={move} onPointerUp={end} onPointerCancel={end}>
              {it.kind === "graph" && graph && (
                <div className="layout-graph"><LiveGraph graph={graph} /></div>
              )}
              {it.kind === "graph" && !graph && (
                <div className="layout-empty">
                  <span>{it.graphId ? "Graph deleted" : "Empty placeholder"}</span>
                  {!readOnly && (
                    <button type="button" onClick={() => props.onChooseGraph(it.id)}>
                      Choose a graph
                    </button>
                  )}
                </div>
              )}
              {it.kind === "picture" && (
                <img className="layout-picture" alt={it.name} draggable={false}
                  src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(it.svg)}`} />
              )}
              {it.kind === "text" && (
                <svg className="layout-svg" width={px(r.w)} height={px(r.h)} overflow="visible"
                  aria-hidden="true"
                  dangerouslySetInnerHTML={{ __html: it.text.trim()
                    ? textSvg({ ...it, ...r }, ink)
                    : textSvg({ ...it, ...r, text: "Text block" }, "currentColor") }}
                  style={it.text.trim() ? undefined : { opacity: 0.45 }} />
              )}
              {it.kind === "legend" && (
                <svg className="layout-svg" width={px(r.w)} height={px(r.h)} overflow="visible"
                  aria-hidden="true"
                  dangerouslySetInnerHTML={{ __html: legendSvg({ ...it, ...r }, legend, ink, surface) }} />
              )}
              {sel && !readOnly && (
                <span className="layout-handle" aria-hidden="true"
                  onPointerDown={(e) => begin(e, it, "resize")}
                  onPointerMove={move} onPointerUp={end} onPointerCancel={end} />
              )}
            </div>
          );
        })}
        <svg className="layout-letters" width={px(w)} height={px(h)} aria-hidden="true"
          overflow="visible" dangerouslySetInnerHTML={{ __html: letterMarkup }} />
      </div>
    </div>
  );
}
