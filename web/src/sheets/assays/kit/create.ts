// Project-level steps shared by the assay modules: start an assay family
// (input table + the module's analysis + its graph), keep the module's
// settings equal on every results sheet of that analysis in the family,
// and make the linked output tables.
//
// Outputs use the ordinary chain mechanism (project/derived.ts): an assay
// analysis is `derivedOnDemand`, and each results sheet of it feeds at
// most one linked table, chosen by its `options.output` key (the module's
// derivedTable reads that key). The first output hangs off the main
// results sheet; further outputs (one XY table per plate, ...) get a
// results sheet of their own with the same settings and another key, so
// every linked table follows the input table and the settings.
import { addFamily, addLinkedTable } from "../../../app/factory";
import { derivedOutputs } from "../../../project/derived";
import type { IdFactory } from "../../../project/ids";
import {
  addSheets, findSheet, makeResultsSheet, renameSheet, uniqueName, updateResultsOptions,
} from "../../../project/ops";
import type { DataSheet, DataTableModel, Project, ResultsSheet } from "../../../project/types";
import type { AssayModule } from "../index";

// ------------------------------------------------------------ wizard requests

const pending = new Set<string>();

/** Ask the assay controls of results sheet `id` to open their wizard the
 *  next time they mount (after "Start from an assay"). Not saved. */
export function requestWizard(id: string): void { pending.add(id); }

/** True once for a requested sheet. */
export function takeWizardRequest(id: string): boolean {
  const had = pending.has(id);
  pending.delete(id);
  return had;
}

// ------------------------------------------------------------ new family

export function createAssayFamily(p: Project, mod: AssayModule, name: string,
  sample: boolean, ids: IdFactory): { project: Project; dataId: string; resultsId: string } {
  const table = sample ? mod.sampleTable() : mod.emptyTable();
  const res = addFamily(p, table, name, ids, { analysis: mod.mainAnalysis });
  const results = res.project.sheets.find((s): s is ResultsSheet =>
    s.kind === "results" && s.parentId === res.dataId && s.analysis === mod.mainAnalysis);
  let project = res.project;
  if (sample && mod.sampleOptions && results) {
    const extra = mod.sampleOptions();
    project = updateResultsOptions(project, results.id, (o) => ({ ...(o as object), ...extra }));
  }
  return { project, dataId: res.dataId, resultsId: results?.id ?? "" };
}

// ------------------------------------------------------------ settings

/** Results sheets of `analysis` on data sheet `dataId`, main sheet first. */
export function assaySheets(p: Project, dataId: string, analysis: string): ResultsSheet[] {
  return p.sheets.filter((s): s is ResultsSheet =>
    s.kind === "results" && s.parentId === dataId && s.analysis === analysis);
}

const outputKey = (o: unknown): string | undefined => {
  const v = o && typeof o === "object" ? (o as { output?: unknown }).output : undefined;
  return typeof v === "string" ? v : undefined;
};

/** Write the same settings to every results sheet of the analysis in the
 *  family, keeping each sheet's own output key. */
export function setFamilySettings<O extends object>(p: Project, dataId: string,
  analysis: string, settings: O): Project {
  let next = p;
  for (const s of assaySheets(p, dataId, analysis)) {
    const key = outputKey(s.options);
    next = updateResultsOptions(next, s.id, () => ({ ...settings, output: key }));
  }
  return next;
}

// ------------------------------------------------------------ outputs

export interface OutputSpec {
  /** Stable key the module's derivedTable reads from options.output. */
  key: string;
  /** Name of the linked table when it is made. */
  name: string;
  /** Its current content (the sync keeps it up to date afterwards). */
  table: DataTableModel;
  /** Options for the linked table's first analysis (e.g. the curve fit
   *  set up for normalized dose-response data). */
  configure?: (options: unknown) => unknown;
}

/** Make sure every output has a producing results sheet and a linked
 *  table. Existing linked tables are kept (and renamed when the output
 *  behind them changed). Returns the project and the first output's id. */
export function ensureOutputs(p: Project, mainId: string, specs: OutputSpec[],
  ids: IdFactory): { project: Project; firstId: string | null } {
  const main = findSheet(p, mainId);
  if (!main || main.kind !== "results" || !specs.length) return { project: p, firstId: null };
  const dataId = main.parentId;
  let next = p;
  let firstId: string | null = null;
  const settings = (main.options && typeof main.options === "object" ? main.options : {}) as object;
  specs.forEach((spec, i) => {
    let producer: ResultsSheet | undefined;
    if (i === 0) {
      producer = findSheet(next, mainId) as ResultsSheet;
      const before = outputKey(producer.options);
      next = updateResultsOptions(next, mainId, (o) => ({ ...(o as object), output: spec.key }));
      producer = findSheet(next, mainId) as ResultsSheet;
      if (before !== undefined && before !== spec.key) {
        for (const d of derivedOutputs(next, mainId)) next = renameSheet(next, d.id, uniqueName(next, spec.name, d.id));
      }
    } else {
      producer = assaySheets(next, dataId, main.analysis)
        .find((s) => s.id !== mainId && outputKey(s.options) === spec.key);
      if (!producer) {
        const id = ids();
        const prev = assaySheets(next, dataId, main.analysis).at(-1)?.id ?? mainId;
        const sheet = makeResultsSheet(id, dataId, main.analysis,
          { ...settings, output: spec.key }, uniqueName(next, `${main.name}: ${spec.name}`));
        next = addSheets(next, [sheet], prev);
        producer = sheet;
      }
    }
    const existing = derivedOutputs(next, producer.id);
    if (existing.length) {
      if (i === 0) firstId = existing[0].id;
      return;
    }
    const made = addLinkedTable(next, producer.id, spec.table, spec.name, ids);
    if (!made) return;
    next = made.project;
    if (i === 0) firstId = made.dataId;
    if (spec.configure) {
      for (const s of next.sheets) {
        if (s.kind === "results" && s.parentId === made.dataId) {
          next = updateResultsOptions(next, s.id, (o) => spec.configure!(o));
        }
      }
    }
  });
  return { project: next, firstId };
}

/** Linked tables fed by any results sheet of the analysis in the family. */
export function familyOutputs(p: Project, dataId: string, analysis: string): DataSheet[] {
  return assaySheets(p, dataId, analysis).flatMap((s) => derivedOutputs(p, s.id));
}
