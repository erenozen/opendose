// What the values of a linked table are, for the figure legend's "Values
// are …" sentence: a named Normalize output's Y title (P-55) or a flow
// summary's statistic with its full gate path (P-31). Pure.
import type { DataSheet, Project } from "../project/types.ts";
import { flowValuesPhrase } from "../sheets/assays/flow/model.ts";
import { normalizedPhrase } from "../sheets/manipulate/normalizeTitle.ts";

export function valuesPhrase(p: Project, data: DataSheet): string | null {
  return normalizedPhrase(p, data) ?? flowValuesPhrase(p, data);
}
