// Add the sheets of another OpenDose project to the open one (P-74, File ›
// Add from project…, or several project files dropped at once).
//
// Every sheet of the added project comes in as it was saved: tables,
// options, cached results, graphs, layouts, info sheets, notes, groups.
// An id the open project already uses (a sheet, group, floating note or
// recipe) gets a new one and every reference to it follows (results and
// graphs to their table, a graph to its results, an info sheet to its
// table, a derived table to its source and producer, a layout to its
// graphs, a sheet to its group); a sheet name already taken gets a
// " (2)" suffix, as Duplicate does. Then repairLinks drops what still
// points nowhere.
//
// Never overwritten: the open project's sheets, preferences, group-colour
// pins and recipes. Where the two projects disagree (an info constant
// with another value, a preference, a pinned colour) the difference is
// returned as a conflict for the caller to show before adding; info
// constants are looked up by name across the whole project
// (project/infoRefs.ts), so each conflict says which value the analyses
// will use after adding. The added project's reproduction records stay
// with its own file. Pure.
import { identifierFor, projectConstants } from "./infoLinks.ts";
import type { IdFactory } from "./ids.ts";
import { repairLinks } from "./ops.ts";
import { reportPrefsOf, P_FLOOR_LABELS, P_STYLE_LABELS, SMD_LABELS, VARIANCE_LABELS } from "../report/prefs.ts";
import { SCHEME_LIST } from "../lib/palette.ts";
import type {
  GroupColor, LayoutItem, Project, ProjectPrefs, Sheet, SheetGroup, TableType,
} from "./types.ts";
import type { ProjectRecipe } from "./recipes.ts";

export interface MergeConflict {
  kind: "constant" | "preference" | "color";
  /** The constant, preference or group name. */
  label: string;
  /** The open project's value (kept). */
  here: string;
  /** The added project's value. */
  there: string;
  /** Constants: the value analyses in both use after adding. */
  used?: string;
}

export interface MergeResult {
  project: Project;
  /** Added project's sheet id -> its id in the merged project. */
  idMap: Map<string, string>;
  /** Data tables added (one per family). */
  families: number;
  sheets: number;
  /** The first added data table (selected after adding). */
  firstDataId: string | null;
  conflicts: MergeConflict[];
}

/** Effective info constants as "@Name" resolves them: lower-cased name
 *  and identifier -> the first value, in projectConstants order (the
 *  order setInfoConstants registers them in). */
export function effectiveConstants(p: Pick<Project, "sheets">): Map<string, { name: string; value: string }> {
  const m = new Map<string, { name: string; value: string }>();
  for (const c of projectConstants(p as Project)) {
    for (const k of [c.name.toLowerCase(), identifierFor(c.name).toLowerCase()]) {
      if (!m.has(k)) m.set(k, { name: c.name, value: c.value });
    }
  }
  return m;
}

const ERROR_BAR_WORDS: Record<string, string> = {
  sd: "SD", sem: "SEM", ci95: "95% CI", range: "range", none: "none",
};

const CI_WORDS: Record<ProjectPrefs["ciMethod"], string> = {
  asymptotic: "Asymptotic (symmetrical)", profile: "Profile likelihood (asymmetrical)",
};

const TABLE_WORDS: Record<TableType, string> = {
  xy: "XY", column: "Column", grouped: "Grouped", contingency: "Contingency",
  survival: "Survival", partsofwhole: "Parts of whole", multivariable: "Multiple variables",
  nested: "Nested",
};

/** The preferences a reader sees differ in, with the open project's kept. */
function prefConflicts(here: ProjectPrefs, there: ProjectPrefs): MergeConflict[] {
  const out: MergeConflict[] = [];
  const add = (label: string, a: string, b: string) => {
    if (a !== b) out.push({ kind: "preference", label, here: a, there: b });
  };
  add("Significant digits in results", String(here.digits), String(there.digits));
  const ra = reportPrefsOf(here);
  const rb = reportPrefsOf(there);
  add("P-value style", P_STYLE_LABELS[ra.pStyle], P_STYLE_LABELS[rb.pStyle]);
  add("Smallest P written exactly", P_FLOOR_LABELS[ra.pFloor], P_FLOOR_LABELS[rb.pFloor]);
  add("Hide “ns”", ra.hideNs ? "yes" : "no", rb.hideNs ? "yes" : "no");
  add("Standardized mean difference shown first", SMD_LABELS[ra.smd], SMD_LABELS[rb.smd]);
  add("Variance explained shown first", VARIANCE_LABELS[ra.variance], VARIANCE_LABELS[rb.variance]);
  add("Same colour for a group on every graph", here.colorByName ? "yes" : "no",
    there.colorByName ? "yes" : "no");
  add("Error bars on new XY fits", ERROR_BAR_WORDS[here.errorBars] ?? here.errorBars,
    ERROR_BAR_WORDS[there.errorBars] ?? there.errorBars);
  add("Confidence intervals on new fits", CI_WORDS[here.ciMethod], CI_WORDS[there.ciMethod]);
  const scheme = (id: string) => SCHEME_LIST.find((x) => x.id === id)?.label ?? id;
  add("Color scheme for new graphs", scheme(here.scheme), scheme(there.scheme));
  add("New data tables start as", TABLE_WORDS[here.defaultTableType],
    TABLE_WORDS[there.defaultTableType]);
  return out;
}

const pinKey = (n: string) => n.trim().toLowerCase();

/** Sheets, groups, notes and recipes of `incoming` added to `base`. */
export function mergeProjects(base: Project, incoming: Project, ids: IdFactory): MergeResult {
  // Every id in use, so no added id can collide with one.
  const taken = new Set<string>();
  for (const s of base.sheets) {
    taken.add(s.id);
    for (const n of s.floatingNotes ?? []) taken.add(n.id);
  }
  for (const g of base.groups ?? []) taken.add(g.id);
  for (const r of base.recipes ?? []) taken.add(r.id);
  const fresh = (id: string): string => {
    let next = id;
    while (!next || taken.has(next)) next = ids();
    taken.add(next);
    return next;
  };

  const idMap = new Map<string, string>();
  for (const s of incoming.sheets) idMap.set(s.id, fresh(s.id));
  const groupMap = new Map<string, string>();
  for (const g of incoming.groups ?? []) groupMap.set(g.id, fresh(g.id));
  const sheetId = (id: string) => idMap.get(id) ?? id;

  const names = new Set(base.sheets.map((s) => s.name));
  const uniqueName = (n: string) => {
    let name = n;
    for (let i = 2; names.has(name); i++) name = `${n} (${i})`;
    names.add(name);
    return name;
  };

  const added: Sheet[] = incoming.sheets.map((src) => {
    const s = structuredClone(src) as Sheet;
    s.id = idMap.get(src.id)!;
    s.name = uniqueName(src.name);
    if (s.groupId) {
      const g = groupMap.get(s.groupId);
      if (g) s.groupId = g; else delete s.groupId;
    }
    if (s.floatingNotes) s.floatingNotes = s.floatingNotes.map((n) => ({ ...n, id: fresh(n.id) }));
    switch (s.kind) {
      case "data":
        if (s.derived) {
          s.derived = { ...s.derived, sourceId: sheetId(s.derived.sourceId),
            resultsId: sheetId(s.derived.resultsId) };
        }
        break;
      case "results":
        s.parentId = sheetId(s.parentId);
        break;
      case "graph":
        s.parentId = sheetId(s.parentId);
        if (s.resultsId) s.resultsId = sheetId(s.resultsId);
        break;
      case "info":
        if (s.parentId) s.parentId = sheetId(s.parentId);
        break;
      case "layout":
        s.graphIds = s.graphIds.map(sheetId);
        if (s.items) {
          s.items = s.items.map((it): LayoutItem => (it.kind === "graph" && it.graphId
            ? { ...it, graphId: sheetId(it.graphId) } : it));
        }
        break;
    }
    return s;
  });

  const groups: SheetGroup[] = [...(base.groups ?? []),
    ...(incoming.groups ?? []).map((g) => ({ ...g, id: groupMap.get(g.id)! }))];

  // Recipes: an identical one is already here; one with a taken name
  // comes in renamed, so both stay.
  const recipes: ProjectRecipe[] = [...(base.recipes ?? [])];
  for (const r of incoming.recipes ?? []) {
    const same = recipes.find((x) => x.name === r.name);
    if (same && JSON.stringify(same.spec) === JSON.stringify(r.spec)) continue;
    let name = r.name;
    for (let i = 2; recipes.some((x) => x.name === name); i++) name = `${r.name} (${i})`;
    recipes.push({ ...r, id: fresh(r.id), name });
  }

  // Group-colour pins: the open project's win; new names come in.
  const conflicts: MergeConflict[] = [];
  const pins: GroupColor[] = [...(base.groupColors ?? [])];
  for (const pin of incoming.groupColors ?? []) {
    const have = pins.find((x) => pinKey(x.name) === pinKey(pin.name));
    if (!have) pins.push(pin);
    else if (have.color.toLowerCase() !== pin.color.toLowerCase()) {
      conflicts.push({ kind: "color", label: have.name, here: have.color, there: pin.color });
    }
  }

  let project: Project = { ...base, sheets: [...base.sheets, ...added] };
  if (groups.length) project.groups = groups;
  if (recipes.length) project.recipes = recipes;
  if (pins.length) project.groupColors = pins;
  project = repairLinks(project);

  // Info constants that resolve differently in the two projects.
  const before = effectiveConstants(base);
  const theirs = effectiveConstants(incoming);
  const after = effectiveConstants(project);
  const seen = new Set<string>();
  for (const [k, a] of before) {
    const b = theirs.get(k);
    if (!b || a.value === b.value) continue;
    const used = after.get(k)!;
    const key = `${a.name.toLowerCase()}\u0000${b.name.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    conflicts.push({ kind: "constant", label: a.name, here: a.value, there: b.value, used: used.value });
  }
  conflicts.push(...prefConflicts(base.prefs, incoming.prefs));

  const data = added.filter((s) => s.kind === "data" && project.sheets.some((x) => x.id === s.id));
  return {
    project, idMap, families: data.length,
    sheets: project.sheets.length - base.sheets.length,
    firstDataId: data[0]?.id ?? null,
    conflicts,
  };
}
