// Open a published reference dataset as a project (P-127): its CSV, as
// the corpus in docs/validation/datasets holds it, becomes a data table
// with the analysis its reference was computed with, and an info sheet
// carries the published values. The files ship with the site (each a
// chunk of its own, loaded when opened): nothing is fetched elsewhere.
import { analysisSheets } from "../app/factory";
import type { IdFactory } from "../project/ids";
import { addSheets, makeDataSheet, makeInfoSheet, makeProject } from "../project/ops";
import type { Project, ProjectPrefs } from "../project/types";
import {
  datasetAnalysis, datasetShortName, datasetTable, referenceNotes,
  type ReferenceDataset, type ReferenceIndex,
} from "./referenceDatasets";

const CSV = import.meta.glob("../../../docs/validation/datasets/nist-*.csv",
  { query: "?raw", import: "default" }) as Record<string, () => Promise<string>>;

/** Results digits of a reference project: the most Preferences offer,
 *  so the numbers can be read against certified values. */
export const REFERENCE_DIGITS = 10;

let index: Promise<ReferenceIndex> | null = null;
export function loadReferenceIndex(): Promise<ReferenceIndex> {
  index ??= import("./referenceDatasets.json").then((m) => m.default as unknown as ReferenceIndex);
  return index;
}

export async function referenceProject(d: ReferenceDataset, prefs: ProjectPrefs,
  ids: IdFactory): Promise<{ project: Project; dataId: string; resultsId: string | null }> {
  const load = CSV[`../../../docs/validation/datasets/${d.file}`];
  if (!load) throw new Error(`its data file “${d.file}” is not in this build`);
  const table = datasetTable(d, await load());
  const { analysis, options } = datasetAnalysis(d);
  let p = makeProject({ ...prefs, digits: REFERENCE_DIGITS }, [], d.title);
  const dataId = ids();
  p = addSheets(p, [makeDataSheet(dataId, datasetShortName(d), table)]);
  const more = analysisSheets(p, dataId, analysis, ids, { options });
  p = addSheets(p, more);
  const info = makeInfoSheet(ids(), "Reference values", null);
  info.constants = [];
  info.notes = referenceNotes(d, REFERENCE_DIGITS);
  p = addSheets(p, [info]);
  return { project: p, dataId, resultsId: more.find((s) => s.kind === "results")?.id ?? null };
}
