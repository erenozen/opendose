// Project files. Version 2 is the multi-sheet project; version 1 (the
// single-table app) is migrated on open into one data sheet + its results
// sheet + its graph.
import { parsePlan } from "./plan.ts";
import { isSchemeId } from "../lib/palette.ts";
import { DEFAULT_COLUMN_OPTIONS, DEFAULT_XY_OPTIONS } from "../types.ts";
import {
  ANALYSIS_COLUMN, ANALYSIS_NONLIN, ANALYSIS_SURVIVAL, COLUMN_GRAPHS,
  GRAPH_SURVIVAL, GRAPH_XY,
} from "./builtin.ts";
import { parseDerivedLink } from "./derived.ts";
import { parseReportMeta } from "../report/meta.ts";
import { reportPrefsOf } from "../report/prefs.ts";
import { repairGroups } from "./groups.ts";
import type { IdFactory } from "./ids.ts";
import { sanitizeLayoutFields } from "./layout.ts";
import { parseNotes } from "./notes.ts";
import {
  makeDataSheet, makeGraphSheet, makeProject, makeResultsSheet, repairLinks,
} from "./ops.ts";
import { sanitizePrefs } from "./prefs.ts";
import { normalizeTable } from "./table.ts";
import {
  HIGHLIGHT_COLORS, type GraphSettings, type HighlightColor, type Project,
  type ProjectPrefs, type Sheet, type SimulationSpec,
} from "./types.ts";

export const FILE_MARKER = "opendose_project";

export interface SerializeOptions {
  /** Sheet id -> fingerprint of the input each result was computed from
   *  (written as `cachedKey`: a reopened project reuses a result while
   *  its input is unchanged instead of recomputing it). */
  keys?: ReadonlyMap<string, string>;
  /** The sheet on screen, reopened next time. */
  selected?: string | null;
  /** Compact JSON (autosave) instead of indented (files). */
  compact?: boolean;
  /** The software saving the file (project/reproduce.ts SavedWith): a
   *  later version that opens it recomputes and compares the results. */
  savedWith?: unknown;
}

/** JSON text of a project. `results` (sheet id -> last computed result)
 *  is written into each results sheet's `cached` field so a reopened file
 *  can show numbers before the engine has recomputed them. */
export function serializeProject(p: Project,
  results?: ReadonlyMap<string, unknown>, opts: SerializeOptions = {}): string {
  const sheets = p.sheets.map((s) => {
    if (s.kind !== "results" || s.frozen) return s;
    const r = results?.get(s.id);
    if (r === undefined) return s;
    const key = opts.keys?.get(s.id);
    const out = { ...s, cached: r };
    if (key) out.cachedKey = key; else delete out.cachedKey;
    return out;
  });
  const selected = opts.selected && p.sheets.some((s) => s.id === opts.selected)
    ? opts.selected : null;
  return JSON.stringify({
    [FILE_MARKER]: 2,
    version: 2,
    title: p.title,
    ...(opts.savedWith ? { savedWith: opts.savedWith } : {}),
    prefs: p.prefs,
    ...(p.groups?.length ? { groups: p.groups } : {}),
    ...(selected ? { selected } : {}),
    sheets,
  }, null, opts.compact ? undefined : 2);
}

/** The sheet that was on screen when the project was saved, if recorded. */
export function savedSelection(text: string): string | null {
  try {
    const v = (JSON.parse(text) as { selected?: unknown }).selected;
    return typeof v === "string" && v ? v : null;
  } catch { return null; }
}

interface LoadContext { prefs: ProjectPrefs; ids: IdFactory }

export function parseProjectFile(text: string, ctx: LoadContext): Project {
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { throw new Error("not a valid JSON file"); }
  return projectFromJson(raw, ctx);
}

export function projectFromJson(raw: unknown, ctx: LoadContext): Project {
  if (!raw || typeof raw !== "object") throw new Error("not an OpenDose project file");
  const r = raw as Record<string, unknown>;
  const version = r[FILE_MARKER] ?? r.version;
  if (version === 1) return migrateV1(r, ctx);
  if (version === 2 && Array.isArray(r.sheets)) return normalizeV2(r, ctx);
  if (typeof version === "number" && version > 2) {
    throw new Error("this project was saved by a newer version of OpenDose");
  }
  throw new Error("not an OpenDose project file");
}

const str = (v: unknown, d = ""): string => (typeof v === "string" ? v : d);
const obj = (v: unknown): Record<string, unknown> =>
  (v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : {});

function titlesOf(v: unknown): { x: string; y: string } {
  const o = obj(v);
  return { x: str(o.x), y: str(o.y) };
}

/** Graph settings from a file (or a template): titles and scheme are
 *  checked; kind-specific keys and `format` pass through (the format is
 *  validated when it is read, see src/graph). */
export function parseGraphSettings(v: unknown, fallbackScheme: GraphSettings["scheme"]): GraphSettings {
  const st = obj(v);
  return {
    ...st,
    titles: titlesOf(st.titles),
    scheme: isSchemeId(st.scheme) ? st.scheme : fallbackScheme,
  };
}

/** v1: {opendose_project: 1, mode, x, datasets, options, columnOptions,
 *  xUnit, scheme, titles}. XY and Column modes shared one grid, survival
 *  kept its own, contingency was never saved; the grid that was saved
 *  becomes the table for the mode the file was saved in. */
export function migrateV1(r: Record<string, unknown>, ctx: LoadContext): Project {
  const mode = str(r.mode, "xy");
  const scheme = isSchemeId(r.scheme) ? r.scheme : ctx.prefs.scheme;
  const titles = obj(r.titles);
  const prefs = { ...ctx.prefs, scheme };
  const p = makeProject(prefs, [], "Migrated project");
  const dataId = ctx.ids();
  const resId = ctx.ids();
  const graphId = ctx.ids();
  const settings = (t: unknown): GraphSettings => ({ titles: titlesOf(t), scheme });
  const base = { x: r.x, datasets: r.datasets, xUnit: str(r.xUnit, "M") };

  if (mode === "survival") {
    const table = normalizeTable({ ...base, type: "survival", xUnit: "" });
    table.datasets = table.datasets.map((d) => ({ ...d, subTitles: ["Time", "Event"] }));
    p.sheets = [
      makeDataSheet(dataId, "Data 1", table),
      makeResultsSheet(resId, dataId, ANALYSIS_SURVIVAL, {}, "Survival of Data 1"),
      makeGraphSheet(graphId, dataId, resId, GRAPH_SURVIVAL, settings(titles.survival),
        "Graph of Data 1"),
    ];
  } else if (mode === "column") {
    const colOpts = obj(r.columnOptions);
    const graphType = (COLUMN_GRAPHS as readonly string[]).includes(str(colOpts.graphType))
      ? str(colOpts.graphType) : "scatter";
    const options = { ...DEFAULT_COLUMN_OPTIONS, ...colOpts };
    delete (options as Record<string, unknown>).graphType;
    const table = normalizeTable({ ...base, type: "column", xUnit: "" });
    p.sheets = [
      makeDataSheet(dataId, "Data 1", table),
      makeResultsSheet(resId, dataId, ANALYSIS_COLUMN, options, "Column stats of Data 1"),
      makeGraphSheet(graphId, dataId, resId, graphType, settings(titles.column),
        "Graph of Data 1"),
    ];
  } else {
    const table = normalizeTable({ ...base, type: "xy" });
    p.sheets = [
      makeDataSheet(dataId, "Data 1", table),
      makeResultsSheet(resId, dataId, ANALYSIS_NONLIN,
        { ...DEFAULT_XY_OPTIONS, ...obj(r.options) }, "Nonlin fit of Data 1"),
      makeGraphSheet(graphId, dataId, resId, GRAPH_XY, settings(titles.xy),
        "Graph of Data 1"),
    ];
  }
  return p;
}

function normalizeV2(r: Record<string, unknown>, ctx: LoadContext): Project {
  const { theme: _t, ...prefs } = sanitizePrefs({ ...ctx.prefs, ...obj(r.prefs) },
    { ...ctx.prefs, theme: "auto" });
  void _t;
  const seen = new Set<string>();
  const noteIds = new Set<string>();
  const sheets: Sheet[] = [];
  for (const item of r.sheets as unknown[]) {
    const s = obj(item);
    let id = str(s.id);
    if (!id || seen.has(id)) id = ctx.ids();
    seen.add(id);
    const floatingNotes = parseNotes(s.floatingNotes, ctx.ids, noteIds);
    const common = {
      id,
      name: str(s.name) || "Untitled",
      frozen: s.frozen === true ? true : undefined,
      highlight: HIGHLIGHT_COLORS.includes(s.highlight as HighlightColor)
        ? s.highlight as HighlightColor : undefined,
      ...(str(s.groupId) ? { groupId: str(s.groupId) } : {}),
      ...(floatingNotes ? { floatingNotes } : {}),
    };
    switch (s.kind) {
      case "data": {
        const derived = parseDerivedLink(s.derived);
        const simulation = parseSimulationSpec(s.simulation);
        const report = parseReportMeta(s.report);
        sheets.push({
          ...common, kind: "data", table: normalizeTable(s.table),
          ...(derived ? { derived } : {}), ...(simulation ? { simulation } : {}),
          ...(report ? { report } : {}),
        });
        break;
      }
      case "results":
        if (!str(s.parentId) || !str(s.analysis)) break;
        sheets.push({
          ...common, kind: "results", parentId: str(s.parentId),
          analysis: str(s.analysis), options: s.options ?? {},
          ...(s.cached !== undefined ? { cached: s.cached } : {}),
          ...(s.cached !== undefined && str(s.cachedKey) ? { cachedKey: str(s.cachedKey) } : {}),
        });
        break;
      case "graph": {
        if (!str(s.parentId) || !str(s.graphType)) break;
        const snap = obj(s.snapshot);
        sheets.push({
          ...common, kind: "graph", parentId: str(s.parentId),
          resultsId: str(s.resultsId) || null, graphType: str(s.graphType),
          settings: parseGraphSettings(s.settings, prefs.scheme),
          ...(s.snapshot && common.frozen ? {
            snapshot: {
              table: normalizeTable(snap.table), result: snap.result ?? null,
              options: snap.options ?? null,
            },
          } : {}),
        });
        break;
      }
      case "info": {
        const plan = parsePlan(s.plan);
        sheets.push({
          ...common, kind: "info", parentId: str(s.parentId) || null,
          notes: str(s.notes),
          constants: Array.isArray(s.constants)
            ? s.constants.map((c) => ({ name: str(obj(c).name), value: str(obj(c).value) }))
            : [],
          ...(plan ? { plan } : {}),
        });
        break;
      }
      case "layout": {
        const g = obj(s.grid);
        const int = (v: unknown, d: number) =>
          (typeof v === "number" && v >= 1 && v <= 12 ? Math.round(v) : d);
        sheets.push({
          ...common, kind: "layout",
          graphIds: Array.isArray(s.graphIds) ? s.graphIds.filter((x) => typeof x === "string") : [],
          grid: { rows: int(g.rows, 1), cols: int(g.cols, 2) },
          ...sanitizeLayoutFields(s),
        });
        break;
      }
      default: break; // unknown kinds from a future version are skipped
    }
  }
  for (const s of sheets) {
    if (s.frozen === undefined) delete s.frozen;
    if (s.highlight === undefined) delete s.highlight;
  }
  const migrated = obj(r.prefs).report === undefined ? promoteGraphPStyle(prefs, sheets) : prefs;
  return repairGroups(repairLinks(makeProject(migrated, sheets, str(r.title) || "Untitled project")),
    r.groups);
}

/**
 * Files from before the project-wide P-value style (0.2.x) kept a P style
 * on each graph (`settings.format.pStyle`, absent = GraphPad) and had no
 * reporting preferences. Since 0.3.0 the project's style (Preferences →
 * Reporting) is the single source and a graph's style only overrides it.
 * When such a file's graphs agree on one style (every graph that draws
 * brackets names it), that style becomes the project's and the graphs
 * follow it, so tables, sentences, legends and brackets read one way;
 * otherwise the graphs keep their own styles as overrides. Mutates the
 * graph sheets' settings in place (they were just built by the loader).
 */
export function promoteGraphPStyle(prefs: ProjectPrefs, sheets: Sheet[]): ProjectPrefs {
  const styles = new Set<string>();
  let unnamedBrackets = false;
  for (const s of sheets) {
    if (s.kind !== "graph") continue;
    const f = obj(s.settings.format);
    if (typeof f.pStyle === "string") styles.add(f.pStyle);
    else if (obj(f.comparisons).show === true) unnamedBrackets = true;
  }
  if (styles.size !== 1 || unnamedBrackets) return prefs;
  const style = [...styles][0];
  if (style !== "apa" && style !== "nejm" && style !== "graphpad") return prefs;
  for (const s of sheets) {
    if (s.kind !== "graph") continue;
    const f = obj(s.settings.format);
    if (!("pStyle" in f)) continue;
    const { pStyle: _p, ...rest } = f;
    void _p;
    s.settings = { ...s.settings, format: rest };
  }
  return { ...prefs, report: { ...reportPrefsOf(prefs), pStyle: style } };
}

function parseSimulationSpec(v: unknown): SimulationSpec | undefined {
  const o = obj(v);
  if (o.kind !== "xy" && o.kind !== "column" && o.kind !== "contingency") return undefined;
  const seed = typeof o.seed === "number" && Number.isFinite(o.seed) ? Math.round(o.seed) : 1;
  return { kind: o.kind, seed, form: o.form ?? null };
}
