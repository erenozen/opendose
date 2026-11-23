// The study design record (P-61), kept on an info sheet beside the
// analysis plan (`InfoSheet.design`): how units were allocated to groups
// (randomisation method and seed), who knew the allocation at each stage
// (blinding), the inclusion and exclusion criteria, and the animals
// (sex, strain, age). The methods text states it and the ARRIVE checklist
// reads it (report/checklists.ts).
//
// Source: ARRIVE 2.0 (Percie du Sert et al. 2020, PLoS Biol 18:e3000410),
// Essential 10 items 3 (inclusion and exclusion criteria), 4
// (randomisation: whether it was used and the method that generated the
// sequence), 5 (blinding: who was aware of the group allocation during
// allocation, the conduct of the experiment, outcome assessment and data
// analysis) and 8 (experimental animals: species, strain, sex, age).
//
// Pure (no React, no engine); unit-tested in __tests__/studyDesign.test.ts.
import { addSheets, makeInfoSheet, uniqueName, updateSheet } from "./ops.ts";
import type { InfoSheet, Project, Sheet } from "./types.ts";

export type BlindingStage = "allocation" | "conduct" | "outcome" | "analysis";
/** "blinded": the people at that stage did not know the allocation. */
export type Blinded = "blinded" | "aware";
export type Sex = "female" | "male" | "both";

export interface StudyDesign {
  /** Units allocated to groups at random, or not; absent: not stated. */
  randomised?: "yes" | "no";
  /** Randomised: how the sequence was generated. Not randomised: how
   *  units were allocated instead. */
  randomisationMethod: string;
  /** The seed of the randomisation sequence, as typed. */
  seed: string;
  /** Who knew the allocation at each stage; a stage absent is not stated. */
  blinding: Partial<Record<BlindingStage, Blinded>>;
  /** Inclusion and exclusion criteria for animals and data points. */
  exclusionCriteria: string;
  sex?: Sex;
  /** Species and strain ("C57BL/6J mice"). */
  strain: string;
  /** Age or developmental stage ("8 to 10 weeks"). */
  age: string;
}

export const BLINDING_STAGES: { id: BlindingStage; label: string; phrase: string }[] = [
  { id: "allocation", label: "Allocation to groups", phrase: "allocation" },
  { id: "conduct", label: "Conduct of the experiment", phrase: "the conduct of the experiment" },
  { id: "outcome", label: "Outcome assessment", phrase: "outcome assessment" },
  { id: "analysis", label: "Data analysis", phrase: "data analysis" },
];

export const SEX_WORDS: Record<Sex, string> = {
  female: "female", male: "male", both: "female and male",
};

export function emptyDesign(): StudyDesign {
  return { randomisationMethod: "", seed: "", blinding: {}, exclusionCriteria: "",
    strain: "", age: "" };
}

const str = (v: unknown, max = 500) => (typeof v === "string" ? v.slice(0, max) : "");
const one = <T extends string>(v: unknown, of: readonly T[]): T | undefined =>
  (of.includes(v as T) ? v as T : undefined);

/** A design from a saved file, or undefined when absent or unusable. */
export function parseStudyDesign(raw: unknown): StudyDesign | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const r = raw as Record<string, unknown>;
  const b = r.blinding && typeof r.blinding === "object" ? r.blinding as Record<string, unknown> : {};
  const blinding: StudyDesign["blinding"] = {};
  for (const s of BLINDING_STAGES) {
    const v = one(b[s.id], ["blinded", "aware"] as const);
    if (v) blinding[s.id] = v;
  }
  const randomised = one(r.randomised, ["yes", "no"] as const);
  const sex = one(r.sex, ["female", "male", "both"] as const);
  return {
    ...(randomised ? { randomised } : {}),
    randomisationMethod: str(r.randomisationMethod), seed: str(r.seed, 60), blinding,
    exclusionCriteria: str(r.exclusionCriteria, 2000),
    ...(sex ? { sex } : {}),
    strain: str(r.strain, 200), age: str(r.age, 200),
  };
}

// ------------------------------------------------------------ words

const list = (xs: string[]) => (xs.length <= 1 ? xs.join("")
  : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);
const clean = (s: string) => s.trim().replace(/\.$/, "");

/** "Experimental units were allocated to groups at random (block
 *  randomisation; seed 20261123)." or null when not stated. */
export function randomisationSentence(d: StudyDesign): string | null {
  const how = clean(d.randomisationMethod);
  const seed = d.seed.trim();
  if (d.randomised === "yes") {
    const bits = [how, seed && `seed ${seed}`].filter(Boolean);
    return `Experimental units were allocated to groups at random${bits.length ? ` (${bits.join("; ")})` : ""}.`;
  }
  if (d.randomised === "no") return `Allocation to groups was not randomised${how ? ` (${how})` : ""}.`;
  return null;
}

/** Who knew the allocation, for the stages stated, or null. */
export function blindingSentence(d: StudyDesign): string | null {
  const blind = BLINDING_STAGES.filter((s) => d.blinding[s.id] === "blinded").map((s) => s.phrase);
  const aware = BLINDING_STAGES.filter((s) => d.blinding[s.id] === "aware").map((s) => s.phrase);
  if (!blind.length && !aware.length) return null;
  const all = blind.length + aware.length === BLINDING_STAGES.length;
  if (all && !aware.length) return `The investigators were blinded to group allocation at every stage (${list(blind)}).`;
  if (all && !blind.length) return "The investigators were aware of group allocation at every stage.";
  const parts = [blind.length ? `blinded to group allocation during ${list(blind)}` : "",
    aware.length ? `${blind.length ? "aware of it" : "aware of group allocation"} during ${list(aware)}` : ""]
    .filter(Boolean);
  return `The investigators were ${parts.join(", and ")}.`;
}

/** "Animals: C57BL/6J mice; sex female and male; age 8 to 10 weeks." */
export function animalsSentence(d: StudyDesign): string | null {
  const parts = [clean(d.strain), d.sex ? `sex ${SEX_WORDS[d.sex]}` : "",
    clean(d.age) ? `age ${clean(d.age)}` : ""].filter(Boolean);
  return parts.length ? `Animals: ${parts.join("; ")}.` : null;
}

/** The study design for the methods text (ARRIVE 2.0 items 3, 4, 5, 8),
 *  or null when nothing is recorded. */
export function designMethodsSentence(d: StudyDesign): string | null {
  const crit = clean(d.exclusionCriteria);
  const out = [randomisationSentence(d), blindingSentence(d),
    crit ? `Inclusion and exclusion criteria: ${crit}.` : null, animalsSentence(d)]
    .filter((s): s is string => !!s);
  return out.length ? out.join(" ") : null;
}

/** The design as plain lines, for the notes of a Prism Info sheet. */
export function designText(d: StudyDesign): string {
  const s = designMethodsSentence(d);
  return s ? `Study design\n${s}` : "";
}

// ------------------------------------------------------------ checklist

export interface DesignOutcome { met: boolean; reason: string }

/** ARRIVE 2.0 item 4. */
export function randomisationOutcome(d: StudyDesign): DesignOutcome {
  const how = clean(d.randomisationMethod);
  if (!d.randomised) return { met: false, reason: "State whether units were allocated to groups at random, and how." };
  if (d.randomised === "no") return { met: true, reason: `Stated: not randomised${how ? ` (${how})` : ""}.` };
  if (!how) return { met: false, reason: "Randomised: name the method used to generate the sequence." };
  return { met: true, reason: `Randomised: ${how}${d.seed.trim() ? `, seed ${d.seed.trim()}` : " (no seed recorded)"}.` };
}

/** ARRIVE 2.0 item 5: met when every stage is stated. */
export function blindingOutcome(d: StudyDesign): DesignOutcome {
  const missing = BLINDING_STAGES.filter((s) => !d.blinding[s.id]).map((s) => s.phrase);
  if (missing.length) return { met: false, reason: `Say who knew the group allocation during ${list(missing)}.` };
  return { met: true, reason: blindingSentence(d)! };
}

/** ARRIVE 2.0 item 8: sex, strain and age. */
export function animalsOutcome(d: StudyDesign): DesignOutcome {
  const missing = [!clean(d.strain) && "species and strain", !d.sex && "sex", !clean(d.age) && "age"]
    .filter((x): x is string => !!x);
  if (missing.length) return { met: false, reason: `State the animals' ${list(missing)}.` };
  return { met: true, reason: animalsSentence(d)! };
}

// ------------------------------------------------------------ in a project

export type DesignSheet = InfoSheet & { design: StudyDesign };

/** The study design for a data table: on an info sheet linked to it, else
 *  on a project-wide info sheet. */
export function designSheetFor(p: Project, dataId: string): DesignSheet | null {
  const info = p.sheets.filter((s): s is DesignSheet => s.kind === "info" && !!s.design);
  return info.find((s) => s.parentId === dataId) ?? info.find((s) => !s.parentId) ?? null;
}

/** Replace the design of info sheet `id`. */
export function setDesign(p: Project, id: string, design: StudyDesign): Project {
  return updateSheet<Sheet>(p, id, (s) => (s.kind === "info" ? { ...s, design } : s));
}

/** Start a design record for a data table: on the first info sheet linked
 *  to it (the analysis plan's, usually), else on a new one. */
export function startDesign(p: Project, dataId: string, ids: () => string):
  { project: Project; sheetId: string } {
  const data = p.sheets.find((s) => s.id === dataId);
  const linked = p.sheets.find((s): s is InfoSheet => s.kind === "info" && s.parentId === dataId
    && !s.frozen);
  if (linked) {
    return { project: linked.design ? p : setDesign(p, linked.id, emptyDesign()), sheetId: linked.id };
  }
  const id = ids();
  const sheet: InfoSheet = {
    ...makeInfoSheet(id, uniqueName(p, `Study design: ${data?.name ?? "data"}`), dataId),
    design: emptyDesign(),
  };
  return { project: addSheets(p, [sheet]), sheetId: id };
}
