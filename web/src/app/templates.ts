// Templates in the app: the ones saved in this browser (IndexedDB, with
// the autosave module's guarded fallbacks), the built-in ones (every
// example table plus a few lab staples), template files, and creating a
// family from a template. The pure model is project/templates.ts.
import { useEffect, useSyncExternalStore } from "react";
import { readValue, writeValue } from "../project/autosave";
import type { IdFactory } from "../project/ids";
import { makeProject } from "../project/ops";
import { normalizeTable } from "../project/table";
import {
  applyTemplate, serializeTemplate, templateFileName, templateFromFamily,
  templateFromJson, type SheetTemplate,
} from "../project/templates";
import type { DataTableModel, Project, ProjectPrefs, TableType } from "../project/types";
import { ASSAYS } from "../sheets/assays";
import { REGISTRY, TABLE_ORDER } from "../sheets/registry";
import { xySample } from "../sheets/xy/sample";
import { budwormTable } from "../sheets/xy/quantalSample";
import { asahTable, ejectionTable } from "../sheets/column/clinicalSamples";
import { lungSurvivalTable, lungVariablesTable } from "../sheets/survival/samples";
import { addDerivedOutputs, addFamily } from "./factory";

const STORAGE_KEY = "templates";

// ------------------------------------------------------------ saved store

interface State { saved: SheetTemplate[]; ready: boolean; error: string | null }

let state: State = { saved: [], ready: false, error: null };
let loading: Promise<void> | null = null;
const listeners = new Set<() => void>();

function setState(next: Partial<State>) {
  state = { ...state, ...next };
  listeners.forEach((fn) => fn());
}

function load(): Promise<void> {
  if (!loading) {
    loading = readValue(STORAGE_KEY).then((raw) => {
      const list = raw && typeof raw === "object" && Array.isArray((raw as { templates?: unknown }).templates)
        ? (raw as { templates: unknown[] }).templates : [];
      const saved: SheetTemplate[] = [];
      for (const item of list) {
        try {
          const t = templateFromJson(item);
          if (!t.builtin) saved.push(t);
        } catch { /* skip a damaged entry */ }
      }
      setState({ saved, ready: true });
    }).catch(() => setState({ ready: true }));
  }
  return loading;
}

async function persist(saved: SheetTemplate[]): Promise<boolean> {
  setState({ saved });
  const ok = await writeValue(STORAGE_KEY, { version: 1, templates: saved });
  setState({ error: ok ? null : "Templates could not be stored in this browser; download them as files instead." });
  return ok;
}

/** Save (or replace, by id) a template in this browser. */
export async function saveTemplate(t: SheetTemplate): Promise<boolean> {
  await load();
  const rest = state.saved.filter((x) => x.id !== t.id);
  return persist([stripBuiltin(t), ...rest]);
}

export async function deleteTemplate(id: string): Promise<void> {
  await load();
  await persist(state.saved.filter((x) => x.id !== id));
}

function stripBuiltin(t: SheetTemplate): SheetTemplate {
  if (!("builtin" in t)) return t;
  const copy = { ...t };
  delete copy.builtin;
  return copy;
}

const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
};
const snapshot = () => state;

/** Saved templates (newest first), loading them on first use. */
export function useSavedTemplates(): State {
  const s = useSyncExternalStore(subscribe, snapshot);
  useEffect(() => { void load(); }, []);
  return s;
}

// ------------------------------------------------------------ files

export function downloadTemplate(t: SheetTemplate): void {
  const blob = new Blob([serializeTemplate(t)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = templateFileName(t);
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/** Read a template file and keep it in this browser. */
export async function importTemplateFile(file: File, ids: IdFactory,
  scheme: ProjectPrefs["scheme"]): Promise<SheetTemplate> {
  let raw: unknown;
  try { raw = JSON.parse(await file.text()); } catch { throw new Error("not a valid JSON file"); }
  const t = templateFromJson(raw, { id: `user:${ids()}`, scheme });
  const named = { ...t, savedAt: t.savedAt || Date.now() };
  await saveTemplate(named);
  return named;
}

export function makeTemplate(p: Project, sheetId: string, o: {
  name: string; description: string; withData: boolean;
}, ids: IdFactory): SheetTemplate | null {
  return templateFromFamily(p, sheetId, { id: `user:${ids()}`, ...o });
}

/** Add a template's family to the project (chain analyses get their
 *  output tables). */
export function addTemplateFamily(p: Project, t: SheetTemplate, name: string,
  ids: IdFactory, withData: boolean): { project: Project; dataId: string } {
  const r = applyTemplate(p, t, name, ids, { withData });
  const created = r.project.sheets.filter((s) => !p.sheets.includes(s));
  return { project: addDerivedOutputs(r.project, created, ids), dataId: r.dataId };
}

// ------------------------------------------------------------ built in

const seq = (prefix: string): IdFactory => {
  let n = 0;
  return () => `${prefix}${++n}`;
};

function fromTable(prefs: ProjectPrefs, id: string, name: string, description: string,
  table: DataTableModel, tableName: string, o: {
    analysis?: string; options?: Record<string, unknown>; graphType?: string; withData?: boolean;
  } = {}): SheetTemplate | null {
  const { project, dataId } = addFamily(makeProject(prefs), table, tableName, seq("b"),
    o.analysis ? { analysis: o.analysis } : undefined);
  const p: Project = {
    ...project,
    sheets: project.sheets.map((s) => {
      if (s.kind === "results" && o.options) {
        return { ...s, options: { ...(s.options as object), ...o.options } };
      }
      if (s.kind === "graph" && o.graphType) return { ...s, graphType: o.graphType };
      return s;
    }),
  };
  const t = templateFromFamily(p, dataId, {
    id: `builtin:${id}`, name, description, withData: o.withData ?? true, now: 0,
  });
  return t ? { ...t, builtin: true } : null;
}

let builtinCache: { key: string; list: SheetTemplate[] } | null = null;

/** Built-in templates: lab staples first, then one per example table. */
export function builtinTemplates(prefs: ProjectPrefs): SheetTemplate[] {
  const key = JSON.stringify(prefs);
  if (builtinCache?.key === key) return builtinCache.list;
  const list: (SheetTemplate | null)[] = [];

  const srb = xySample();
  list.push(fromTable(prefs, "srb-ic50", "96-well SRB plate: IC50",
    "Nine half-log concentrations (1 nM to 10 µM, in M) in triplicate, fitted with "
    + "log(inhibitor) vs. response, variable slope. Read a plate-reader export with "
    + "“Import plate (SRB…)” above the table, or type percent growth values; "
    + "the fit and the IC50 follow.",
    { ...srb, datasets: [{ ...srb.datasets[0], name: "Cell line 1" }] }, "SRB plate",
    { withData: false }));

  const twoGroups = normalizeTable({
    type: "column",
    datasets: [
      { name: "Control", rows: [["23.1"], ["25.4"], ["21.8"], ["24.9"], ["22.6"], ["26.0"]] },
      { name: "Treated", rows: [["28.4"], ["30.2"], ["27.1"], ["31.5"], ["29.0"], ["28.8"]] },
    ],
  });
  list.push(fromTable(prefs, "t-test", "Two-group t test",
    "Two columns (control and treated), compared with an unpaired t test. Replace the "
    + "example values with yours; the test, its confidence interval and the graph update.",
    twoGroups, "t test", { analysis: "column", options: { analysis: "ttest", ttestKind: "unpaired" } }));

  const col = REGISTRY.column.sampleTable?.();
  if (col) {
    list.push(fromTable(prefs, "anova-tukey", "One-way ANOVA with Tukey",
      "Three groups compared by ordinary one-way ANOVA, followed by Tukey’s multiple "
      + "comparisons of every pair. Add columns for more groups.",
      col, "ANOVA", {
        analysis: "column",
        options: { analysis: "anova", anovaKind: "parametric", comparisons: "tukey" },
        graphType: "bar",
      }));
  }
  const surv = REGISTRY.survival.sampleTable?.();
  if (surv) {
    list.push(fromTable(prefs, "kaplan-meier", "Kaplan–Meier comparison",
      "Time and event (1 = event, 0 = censored) for each subject, one column per group: "
      + "Kaplan–Meier curves with the log-rank comparison.", surv, "Survival"));
  }

  // Clinical statistics, each on published data its numbers are pinned to.
  list.push(fromTable(prefs, "cox-lung", "Cox regression (lung cancer data)",
    "228 patients of the NCCTG lung cancer study: days of follow-up, death (1) or censoring (0), "
    + "one group per sex and age as a covariate column. Cox regression gives the hazard ratio of "
    + "each, adjusted for the other, with the proportional-hazards test.",
    lungSurvivalTable(), "Lung cancer survival", { analysis: "cox" }));
  list.push(fromTable(prefs, "cox-lung-variables", "Cox regression from a variables table",
    "The same lung cancer data as one row per patient (days, status 1 = censored / 2 = died, "
    + "age, sex), analysed by Cox regression with the time and event variables chosen.",
    lungVariablesTable(), "Lung cancer (variables)", { analysis: "mv_cox" }));
  list.push(fromTable(prefs, "roc-compare", "ROC curves: compare two markers",
    "113 patients after subarachnoid haemorrhage: the WFNS score and serum S100B for poor and good "
    + "outcome. Both ROC curves with their optimal cut-offs, and DeLong's paired comparison.",
    asahTable(), "Haemorrhage markers", { analysis: "roc_curve" }));
  list.push(fromTable(prefs, "bland-altman", "Bland–Altman method comparison",
    "Ejection fraction measured by two methods, 60 pairs from 12 subjects (subject in the row "
    + "titles): bias and limits of agreement with confidence intervals; switch on repeated "
    + "measurements to account for the subjects.",
    ejectionTable(), "Ejection fraction", { analysis: "bland_altman" }));
  list.push(fromTable(prefs, "quantal-budworm", "Quantal dose-response (LD50)",
    "Moths killed out of 20 at six doses of an insecticide, by sex (X = log2 dose). Logit fits "
    + "with a common slope: effective doses with Fieller CIs and the relative potency.",
    budwormTable(), "Budworm", {
      analysis: "quantal",
      options: { link: "logit", doseTransform: "none", parallel: true, ecLevels: "25, 50, 75" },
    }));

  // Assay modules' example tables, each with its analysis set up.
  for (const t of ASSAYS.flatMap((m) => m.templates ?? [])) {
    list.push(fromTable(prefs, t.id, t.name, t.description, t.table(), t.tableName, {
      analysis: t.analysis, options: t.options, graphType: t.graphType,
    }));
  }

  for (const type of TABLE_ORDER) {
    const def = REGISTRY[type as TableType];
    if (!def.sampleTable) continue;
    list.push(fromTable(prefs, `example-${type}`, def.sampleName ?? `${def.label} example`,
      `${def.description} Starts from the example data.`, def.sampleTable(),
      def.sampleName ?? def.label));
  }
  const out = list.filter((t): t is SheetTemplate => !!t);
  builtinCache = { key, list: out };
  return out;
}

/** One line describing a template's table. */
export function templateShape(t: SheetTemplate): string {
  const def = REGISTRY[t.table.type];
  const rows = t.table.x.length;
  const sub = Math.max(1, ...t.table.datasets.map((d) => d.rows[0]?.length ?? 1));
  const cols = t.table.datasets.length;
  return `${def?.label ?? t.table.type} table, ${cols} column${cols === 1 ? "" : "s"}`
    + `${sub > 1 ? ` × ${sub} replicates` : ""}, ${rows} row${rows === 1 ? "" : "s"}`;
}
