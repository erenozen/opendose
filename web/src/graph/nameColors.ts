// "Same colour for a group on every graph" (Preferences): each group name
// gets one palette colour for the whole project, so "Control" is the same
// colour on every graph whatever its position. Names take colours in the
// order they first appear in the project's data tables (top of the sheet
// list first). A colour set by hand on a graph still wins. The colours go
// into the format a graph is drawn with, never into the saved format.
// Pure.
import { seriesStyle, type SchemeId } from "../lib/palette.ts";
import type { GraphFormat } from "./format.ts";
import type { Project } from "../project/types.ts";

export const nameKey = (n: string) => n.trim().toLocaleLowerCase();

/** Palette index of every group name in the project. */
export function nameColorIndex(p: Pick<Project, "sheets">): Map<string, number> {
  const m = new Map<string, number>();
  for (const s of p.sheets) {
    if (s.kind !== "data") continue;
    for (const d of s.table.datasets) {
      const k = nameKey(d.name);
      if (k && !m.has(k)) m.set(k, m.size);
    }
  }
  return m;
}

/** The format with each data set that has no colour of its own coloured
 *  by its name (unchanged when no name moves a colour). */
export function withNameColors(f: GraphFormat, names: string[], index: Map<string, number>,
  dark: boolean, scheme?: SchemeId): GraphFormat {
  let datasets = f.datasets;
  names.forEach((n, i) => {
    const own = f.datasets?.[String(i)];
    if (own?.color) return;
    const idx = index.get(nameKey(n));
    if (idx === undefined || idx === i) return;
    datasets = { ...(datasets ?? {}), [String(i)]: { ...(own ?? {}), color: seriesStyle(idx, dark, scheme).color } };
  });
  return datasets === f.datasets ? f : { ...f, datasets };
}

/** A format saved from a graph drawn with name colours, without them:
 *  data sets that had no colour of their own get none again. */
export function stripNameColors(saved: GraphFormat, raw: GraphFormat): GraphFormat {
  if (!saved.datasets) return saved;
  const datasets = { ...saved.datasets };
  for (const [k, v] of Object.entries(datasets)) {
    if (raw.datasets?.[k]?.color || !v?.color) continue;
    const { color: _c, ...rest } = v;
    void _c;
    if (Object.keys(rest).length) datasets[k] = rest;
    else delete datasets[k];
  }
  return { ...saved, datasets: Object.keys(datasets).length ? datasets : undefined };
}
