// The project file as persist.serializeProject writes it: the project
// model (types.ts) plus the keys only the file carries. The published JSON
// Schema (docs/project-file.schema.json) is generated from this type by
// scripts/project-schema.mjs; nothing here exists at runtime.
import type { SavedWith } from "./reproduce.ts";
import type { Project } from "./types.ts";

/**
 * An OpenDose project file (format version 2). Share links carry the same
 * JSON without `prefs`.
 */
export interface ProjectFile extends Project {
  /** Marks the file as an OpenDose project and gives its format version. */
  opendose_project: 2;
  /** The software that saved the file; a later build that opens it
   *  recomputes the saved results and compares them (project/reproduce.ts). */
  savedWith?: SavedWith;
  /** The sheet on screen when the file was saved, reopened first. */
  selected?: string;
}
