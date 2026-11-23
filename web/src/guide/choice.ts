// The reason "Help me choose…" (or "Plan an experiment…") gave for the
// analysis it opened, kept on that results sheet (ResultsSheet.chosen) so
// it travels in the project file and share links: the results sheet says
// why this test (components/ResultsLinks) and so does the methods
// paragraph (report/methods.ts). Pure.
import type { ChosenTest, Project, ResultsSheet } from "../project/types.ts";

export type { ChosenTest };

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** `p` with the chooser's reason on results sheet `resultsId`. */
export function withChoice(p: Project, resultsId: string, c: ChosenTest): Project {
  return {
    ...p,
    sheets: p.sheets.map((s) => (s.id === resultsId && s.kind === "results"
      ? { ...s, chosen: { ...c, options: { ...c.options } } } : s)),
  };
}

/** `p` without the reason on results sheet `resultsId`. */
export function withoutChoice(p: Project, resultsId: string): Project {
  if (!p.sheets.some((s) => s.id === resultsId && s.kind === "results" && s.chosen)) return p;
  return {
    ...p,
    sheets: p.sheets.map((s) => {
      if (s.id !== resultsId || s.kind !== "results" || !s.chosen) return s;
      const { chosen: _c, ...rest } = s;
      void _c;
      return rest;
    }),
  };
}

/**
 * The reason, while it still describes the sheet: the same analysis, and
 * every option the chooser set still at the value it set. Changing one
 * (Welch to Mann-Whitney, say) makes the reason wrong for the test that
 * now runs, so it is not shown and not written into the methods.
 */
export function currentChoice(sheet: Pick<ResultsSheet, "analysis" | "options" | "chosen">):
  ChosenTest | null {
  const c = sheet.chosen;
  if (!c || c.analysis !== sheet.analysis) return null;
  const opts = (sheet.options && typeof sheet.options === "object"
    ? sheet.options : {}) as Record<string, unknown>;
  for (const [k, v] of Object.entries(c.options)) if (!same(opts[k], v)) return null;
  return c;
}

const text = (v: unknown) => (typeof v === "string" ? v.trim() : "");

/** A saved reason, checked (null when absent or malformed). */
export function parseChosen(v: unknown): ChosenTest | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const o = v as Record<string, unknown>;
  const test = text(o.test);
  const reason = text(o.reason);
  const analysis = text(o.analysis);
  if (!test || !reason || !analysis) return null;
  const options = o.options && typeof o.options === "object" && !Array.isArray(o.options)
    ? { ...(o.options as Record<string, unknown>) } : {};
  return { test, reason, analysis, options };
}
