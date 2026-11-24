// Exercise links for teaching (P-126). A share link may carry an
// exercise: a task for the student, and whether the test that was run is
// withheld too. A project opened from such a link shows the data and the
// task; the results (P values, conclusions, every number of the
// analyses) stay withheld until the student commits answers in Help me
// choose, whose choice (guide/choice.ts, P-32's chooser record) is then
// shown beside the analysis the link holds.
//
// Withheld in the app only: the link payload holds the whole project,
// answer included (the Share dialog says so to instructors). The
// exercise is a top-level `exercise` key of the link's JSON: links
// without it decode exactly as before, and a build that does not know the
// key opens the link with everything shown. Project files never carry
// it. Pure.
import { currentChoice, type ChosenTest } from "../guide/choice.ts";
import type { Project, ResultsSheet } from "../project/types.ts";

export interface Exercise {
  /** The task the student sees, as the instructor wrote it. */
  task: string;
  /** Also withhold which test was run: analysis names, settings and
   *  methods text. */
  hideTest: boolean;
}

export const MAX_TASK_LENGTH = 2000;

/** The task as stored: trimmed, at most MAX_TASK_LENGTH characters. */
export function cleanTask(v: unknown): string {
  return typeof v === "string" ? v.replace(/\r\n?/g, "\n").trim().slice(0, MAX_TASK_LENGTH) : "";
}

/** The exercise of a link's JSON, or null (no exercise, or malformed). */
export function parseExercise(v: unknown): Exercise | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const o = v as Record<string, unknown>;
  const task = cleanTask(o.task);
  if (!task) return null;
  return { task, hideTest: o.hideTest !== false };
}

/** Results sheets in project order. */
const resultsOf = (p: Project) => p.sheets.filter((s): s is ResultsSheet => s.kind === "results");

/** The neutral name a results sheet gets while the test is withheld. */
export const maskedName = (i: number) => `Analysis ${i + 1}`;

/**
 * The project as the student first sees it: with `hideTest`, every
 * results sheet is renamed "Analysis 1", "Analysis 2", ... (their panes,
 * which also name the test, are withheld on screen). `names` keeps the
 * real names to put back (unmaskProject).
 */
export function maskProject(p: Project, ex: Exercise): { project: Project; names: Record<string, string> } {
  if (!ex.hideTest) return { project: p, names: {} };
  const names: Record<string, string> = {};
  const order = new Map(resultsOf(p).map((s, i) => [s.id, i]));
  return {
    names,
    project: {
      ...p,
      sheets: p.sheets.map((s) => {
        if (s.kind !== "results") return s;
        names[s.id] = s.name;
        return { ...s, name: maskedName(order.get(s.id)!) };
      }),
    },
  };
}

/** The project with the names maskProject set aside put back. */
export function unmaskProject(p: Project, names: Record<string, string>): Project {
  if (!Object.keys(names).length) return p;
  return {
    ...p,
    sheets: p.sheets.map((s) => (s.kind === "results" && names[s.id] !== undefined
      ? { ...s, name: names[s.id] } : s)),
  };
}

/** How the student's choice compares with the analyses the link holds. */
export interface ExerciseOutcome {
  /** The analyses of the link, by their (real) names. */
  analyses: string[];
  /** The results sheets the choice describes: same analysis, and every
   *  option the chooser set at the value it set (guide/choice.ts). */
  matching: string[];
}

export function exerciseOutcome(p: Project, names: Record<string, string>,
  choice: ChosenTest): ExerciseOutcome {
  const sheets = resultsOf(p);
  const real = (s: ResultsSheet) => names[s.id] ?? s.name;
  return {
    analyses: sheets.map(real),
    matching: sheets.filter((s) => currentChoice({ analysis: s.analysis, options: s.options,
      chosen: choice }) !== null).map(real),
  };
}

/** "Unpaired t test", "Unpaired t test and Mann-Whitney test". */
export function namesText(names: readonly string[]): string {
  const q = names.map((n) => `“${n}”`);
  return q.length <= 1 ? q.join("") : `${q.slice(0, -1).join(", ")} and ${q[q.length - 1]}`;
}
