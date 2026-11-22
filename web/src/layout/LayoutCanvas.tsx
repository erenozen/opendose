import { useLayoutEffect, useRef, type CSSProperties, type RefObject } from "react";
import { legendSvg, letterSvg, textSvg } from "../export/compose";
import {
  clampRect, pageDims, panelLetters, PX_PER_MM, snapMove, snapResize,
  type LegendEntry, type ResolvedLayout,
} from "../project/layout";
import type { GraphSheet, LayoutItem, LayoutRect, Project } from "../project/types";
import { Button } from "../components/ui";
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
  /** The item element, moved by transform (or sized) while dragging. */
  el: HTMLElement;
  /** Its panel letter, moved with it. */
  letter: SVGGElement | null;
  /** The snapped rectangle under the pointer, committed on release. */
  rect: LayoutRect | null;
}

const px = (mm: number) => mm * PX_PER_MM;
const rectOf = (it: LayoutItem): LayoutRect => ({ x: it.x, y: it.y, w: it.w, h: it.h });
/** An item id as an attribute value safe in a selector. */
const letterKey = (id: string) => id.replace(/[^\w-]/g, "");
const same = (a: LayoutRect, b: LayoutRect) => a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;

function itemLabel(it: LayoutItem, project: Project): string {
  if (it.kind === "graph") {
    const g = project.sheets.find((s) => s.id === it.graphId);
    return g ? `Graph “${g.name}”` : "Empty graph placeholder";
  }
  if (it.kind === "picture") return `Picture “${it.name}”`;
  if (it.kind === "text") return `Text “${it.text.slice(0, 30) || "empty"}”`;
  return "Master legend";
}

/** Puts a dragged item back under React's own left/top/width/height. */
function release(d: Pick<Drag, "el" | "letter">) {
  d.el.style.transform = "";
  d.el.style.removeProperty("width");
  d.el.style.removeProperty("height");
  d.letter?.removeAttribute("transform");
}

/**
 * The page itself, drawn at true size (1 mm = 3.78 CSS px) and scaled to
 * fit, so graphs lay out exactly as they will export. Items move by drag
 * or arrow keys (Shift: 10 mm) and resize from their corner handle or
 * with Alt+arrows; edges snap to margins, the page centre and other
 * items (hold Alt while dragging to place freely).
 *
 * A drag follows the pointer 1:1 without re-rendering the page (BEF-13):
 * the item moves by transform (or is sized in place for a resize) and
 * the snapped rectangle is committed once, on release, as one undo step.
 * On touch an item must be selected (tapped) before it drags, so a swipe
 * over the page still scrolls it (GL-08).
 */
export default function LayoutCanvas(props: CanvasProps) {
  const { layout, project, readOnly, zoom, ink, surface, selected, legend, pageRef } = props;
  const { w, h } = pageDims(layout.page);
  const drag = useRef<Drag | null>(null);
  // A released drag waits for React to draw the committed rectangle
  // before its inline transform is dropped, so nothing flashes back.
  const settling = useRef<Pick<Drag, "el" | "letter"> | null>(null);
  const letters = panelLetters(layout.items, layout.letters);

  useLayoutEffect(() => {
    if (settling.current) { release(settling.current); settling.current = null; }
  }, [layout]);

  const begin = (e: React.PointerEvent, it: LayoutItem, mode: Drag["mode"]) => {
    if (readOnly || e.button !== 0) return;
    if ((e.target as HTMLElement).closest("button, input, select, textarea, a")) return;
    // A finger on an item that is not selected may be scrolling the page;
    // the tap that follows focuses (and so selects) the item.
    if (e.pointerType === "touch" && selected !== it.id) return;
    e.preventDefault();
    e.stopPropagation();
    props.onSelect(it.id);
    const handle = e.currentTarget as HTMLElement;
    const el = handle.closest<HTMLElement>(".layout-item");
    if (!el) return;
    handle.setPointerCapture(e.pointerId);
    el.focus({ preventScroll: true });
    drag.current = {
      id: it.id, mode, x: e.clientX, y: e.clientY, start: rectOf(it),
      others: layout.items.filter((o) => o.id !== it.id).map(rectOf),
      el, rect: null,
      letter: pageRef.current?.querySelector<SVGGElement>(
        `.layout-letters [data-for="${letterKey(it.id)}"]`) ?? null,
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
    d.rect = snapped;
    if (d.mode === "move") {
      const tx = px(snapped.x - d.start.x);
      const ty = px(snapped.y - d.start.y);
      d.el.style.transform = `translate(${tx}px, ${ty}px)`;
      d.letter?.setAttribute("transform", `translate(${tx} ${ty})`);
    } else {
      d.el.style.width = `${px(snapped.w)}px`;
      d.el.style.height = `${px(snapped.h)}px`;
    }
  };
  const end = () => {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    if (d.rect && !same(d.rect, d.start)) {
      settling.current = d;
      props.onRect(d.id, d.rect, null);
    } else release(d);
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

  // One group per letter, so a drag can move its item's letter with it.
  const letterMarkup = [...letters.entries()].map(([id, label]) => {
    const it = layout.items.find((i) => i.id === id)!;
    return `<g data-for="${letterKey(id)}">`
      + `${letterSvg(label, px(it.x), px(it.y), layout.letters, ink)}</g>`;
  }).join("");

  return (
    <div className="layout-stage" style={{ width: px(w) * zoom, height: px(h) * zoom }}>
      <div ref={pageRef}
        className={`layout-page${bg === "transparent" ? " is-transparent" : ""}`}
        style={{ width: px(w), height: px(h), transform: `scale(${zoom})`, background: pageBg,
          color: ink, "--zoom": zoom } as CSSProperties}
        onPointerDown={(e) => { if (e.target === e.currentTarget) props.onSelect(null); }}
        aria-label={`Page, ${Math.round(w)} × ${Math.round(h)} mm`} role="region">
        <div className="layout-margin" aria-hidden="true" style={{
          inset: px(Math.min(layout.page.margin, w / 3, h / 3)) }} />
        {layout.items.map((it) => {
          const sel = selected === it.id;
          const graph = it.kind === "graph" && it.graphId
            ? project.sheets.find((s): s is GraphSheet => s.kind === "graph" && s.id === it.graphId)
            : undefined;
          return (
            <div key={it.id} data-item-id={it.id}
              className={`layout-item kind-${it.kind}${sel ? " selected" : ""}`
                + `${it.kind === "graph" && it.hideLegend ? " no-legend" : ""}`
                + `${it.kind === "graph" && !graph ? " is-empty" : ""}`}
              style={{ left: px(it.x), top: px(it.y), width: px(it.w), height: px(it.h) }}
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
                    <Button size="sm" onClick={() => props.onChooseGraph(it.id)}>
                      Choose a graph
                    </Button>
                  )}
                </div>
              )}
              {it.kind === "picture" && (
                <img className="layout-picture" alt={it.name} draggable={false}
                  src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(it.svg)}`} />
              )}
              {it.kind === "text" && (
                <svg className="layout-svg" width={px(it.w)} height={px(it.h)} overflow="visible"
                  aria-hidden="true"
                  dangerouslySetInnerHTML={{ __html: it.text.trim()
                    ? textSvg(it, ink)
                    : textSvg({ ...it, text: "Text block" }, "currentColor") }}
                  style={it.text.trim() ? undefined : { opacity: 0.45 }} />
              )}
              {it.kind === "legend" && (
                <svg className="layout-svg" width={px(it.w)} height={px(it.h)} overflow="visible"
                  aria-hidden="true"
                  dangerouslySetInnerHTML={{ __html: legendSvg(it, legend, ink, surface) }} />
              )}
              {sel && !readOnly && (
                <span className="layout-handle" aria-hidden="true" data-still
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
