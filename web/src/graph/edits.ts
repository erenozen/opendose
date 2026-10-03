// Dragging annotations on the graph: Plotly reports the new positions in a
// `plotly_relayout` event ("annotations[3].x": ..., "shapes[0].y1": ...).
// These pure helpers turn that event into an updated GraphFormat, and
// build the Plotly config that enables the dragging.
import { axisMaps, type Layout } from "./apply.ts";
import type { Annotation, GraphFormat } from "./format.ts";

/** Plotly config for a formatted graph: annotation dragging is switched on
 *  only when the graph has user annotations and can be edited. Otherwise
 *  the base config is returned unchanged. */
export function plotConfig<const T extends object>(base: T, format: GraphFormat,
  editable: boolean): T {
  if (!editable || !format.annotations?.length) return base;
  return { ...base, edits: { annotationPosition: true, annotationTail: true } };
}

const KEY = /^(annotations|shapes)\[(\d+)\]\.(x|y|ax|ay|x0|x1|y0|y1)$/;

/**
 * Apply a relayout event to the format.
 *
 * `annotations`/`shapes` are the layout lists the graph was drawn with
 * (user items carry `name: "user:<id>"`). Returns the new format (null
 * when no user item moved) and whether a generated item (bracket, letter,
 * at-risk count) was dragged, in which case the caller redraws to put it
 * back.
 */
export function relayoutToFormat(format: GraphFormat, ev: Record<string, unknown>,
  annotations: Layout[] | undefined, shapes: Layout[] | undefined):
  { format: GraphFormat | null; foreign: boolean } {
  const maps = axisMaps(format);
  const list = [...(format.annotations ?? [])];
  const byId = new Map(list.map((a, i) => [a.id, i]));
  let changed = false, foreign = false;
  for (const [k, raw] of Object.entries(ev)) {
    const m = KEY.exec(k);
    if (!m || typeof raw !== "number" || !Number.isFinite(raw)) continue;
    const item = (m[1] === "annotations" ? annotations : shapes)?.[Number(m[2])];
    const name = typeof item?.name === "string" ? item.name : "";
    if (!name.startsWith("user:")) { if (m[1] === "annotations") foreign = true; continue; }
    const at = byId.get(name.slice(5));
    if (at === undefined) continue;
    const a = { ...list[at] } as Annotation & Record<string, number>;
    const attr = m[3];
    const data = a.ref === "data";
    const axis = attr.startsWith("x") || attr === "ax" ? "x" : "y";
    const fromAxis = (v: number) => (data ? maps[axis].from(v) : v);
    if (a.kind === "text" || a.kind === "results") {
      if (attr === "x" || attr === "y") a[attr] = fromAxis(raw);
      else if (attr === "ax" || attr === "ay") a[attr] = raw; // pixels
    } else if (a.kind === "arrow" && m[1] === "annotations") {
      // head = (x1, y1), tail = (x0, y0), tail in axis units
      const target = attr === "x" ? "x1" : attr === "y" ? "y1" : attr === "ax" ? "x0" : "y0";
      a[target] = fromAxis(raw);
    } else if (m[1] === "shapes" && /^(x|y)[01]$/.test(attr)) {
      a[attr] = fromAxis(raw);
    } else continue;
    list[at] = a;
    changed = true;
  }
  return { format: changed ? { ...format, annotations: list } : null, foreign };
}
