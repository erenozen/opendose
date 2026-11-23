// "Same colour for a group on every graph" (Preferences): each group name
// gets one palette colour for the whole project, so "Control" is the same
// colour on every graph whatever its position. Names take colours in the
// order they first appear in the project's data tables (top of the sheet
// list first). A colour set by hand on a graph still wins. The colours go
// into the format a graph is drawn with, never into the saved format.
// Pure.
import { seriesStyle, type SchemeId } from "../lib/palette.ts";
import type { GraphFormat } from "./format.ts";
import type { GroupColor, Project } from "../project/types.ts";
import { contrastRatio, MARK_CONTRAST } from "./color.ts";
import { CVD_LABELS, cvdReport } from "./cvd.ts";
import { EXPORT_CHROME_LIGHT } from "../lib/chrome.ts";

/** The export paper (white): pins are checked against it and the dark background. */
const PAPER = EXPORT_CHROME_LIGHT.surface;

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

// ---------------------------------------------------------- pinned colours
// "KO = orange" (P-56): a colour chosen for a group name, kept in the
// project (Project.groupColors) and used by every graph that has a data
// set of that name, in the workbench and on layout pages. It is the same
// colour in light and dark, so a dark-theme export in print colours draws
// it unchanged. A colour set by hand on a graph still wins; a pin wins
// over "same colour for a group" (which only picks a palette slot).

/** The pinned colour of each group name (by nameKey), valid #rrggbb only. */
export function pinIndex(pins: readonly GroupColor[] | undefined): Map<string, string> {
  const m = new Map<string, string>();
  for (const p of pins ?? []) {
    const k = nameKey(p.name);
    if (k && /^#[0-9a-f]{6}$/i.test(p.color) && !m.has(k)) m.set(k, p.color.toLowerCase());
  }
  return m;
}

/** The format with each data set that has no colour of its own and a
 *  pinned name drawn in the pinned colour (the same object when no data
 *  set has a pinned name, so a graph without one is untouched). */
export function withPinnedColors(f: GraphFormat, names: string[], pins: Map<string, string>): GraphFormat {
  if (!pins.size) return f;
  let datasets = f.datasets;
  names.forEach((n, i) => {
    const own = f.datasets?.[String(i)];
    if (own?.color) return;
    const c = pins.get(nameKey(n));
    if (!c) return;
    datasets = { ...(datasets ?? {}), [String(i)]: { ...(own ?? {}), color: c } };
  });
  return datasets === f.datasets ? f : { ...f, datasets };
}

/** Sanitize `groupColors` read from a file: absent (every file saved
 *  before pins existed) stays absent; bad entries are dropped. */
export function parseGroupColors(v: unknown): GroupColor[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const out: GroupColor[] = [];
  const seen = new Set<string>();
  for (const e of v) {
    if (!e || typeof e !== "object") continue;
    const { name, color } = e as Record<string, unknown>;
    if (typeof name !== "string" || typeof color !== "string") continue;
    const k = nameKey(name);
    if (!k || seen.has(k) || !/^#[0-9a-f]{6}$/i.test(color)) continue;
    seen.add(k);
    out.push({ name: name.trim().slice(0, 200), color: color.toLowerCase() });
  }
  return out;
}

/** Problems with the pinned colours, as sentences: marks under 3:1
 *  contrast on the export background (white) or the dark plot
 *  background, and pairs of pins that look alike (CIEDE2000 under 10)
 *  for normal vision or a colour-vision deficiency (graph/cvd.ts:
 *  Machado et al. 2009). Warnings, never refusals. */
export function pinWarnings(pins: readonly GroupColor[], darkSurface: string): string[] {
  const out: string[] = [];
  const q = (s: string) => `“${s}”`;
  for (const p of pins) {
    const light = contrastRatio(p.color, PAPER);
    const dark = contrastRatio(p.color, darkSurface);
    if (light < MARK_CONTRAST) {
      out.push(`${q(p.name)} has low contrast on a white background (${light.toFixed(1)}:1; marks need 3:1).`);
    }
    if (dark < MARK_CONTRAST) {
      out.push(`${q(p.name)} has low contrast on the dark background (${dark.toFixed(1)}:1; marks need 3:1).`);
    }
  }
  if (pins.length > 1) {
    const rows = cvdReport(pins.map((p) => ({ color: p.color })), PAPER);
    const said = new Set<string>();
    for (const r of rows) {
      for (const c of r.confusable) {
        const key = `${c.a}:${c.b}`;
        if (said.has(key)) continue;
        said.add(key);
        const who = r.mode === "normal" ? "to everyone" : `in ${CVD_LABELS[r.mode].toLowerCase()}`;
        out.push(`${q(pins[c.a].name)} and ${q(pins[c.b].name)} look ${c.severe ? "the same" : "alike"} `
          + `${who} (ΔE ${c.dE.toFixed(1)}).`);
      }
    }
  }
  return out;
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
