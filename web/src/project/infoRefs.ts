// "@Name" in an analysis option: the value of the Info-sheet constant
// called Name (case-insensitive; a name with spaces is written with
// underscores, "@Dilution_factor", or in full as the whole value,
// "@Dilution factor"). Resolved before the options are read
// (app/analysis.ts resolveOptions), so the analysis re-runs with the
// constant's current value and its results show the number used. An
// unknown name is left as typed (the analysis then reports it is not a
// number). The constants are those of the open project, registered by
// the project context (setInfoConstants), as the display digits are.
import { identifierFor, projectConstants } from "./infoLinks.ts";
import type { Project } from "./types.ts";

let current = new Map<string, string>();
let signature = "";

/** Register the open project's constants (project-wide and linked ones
 *  first, as projectConstants orders them). */
export function setInfoConstants(p: Pick<Project, "sheets">): void {
  const m = new Map<string, string>();
  for (const c of projectConstants(p as Project)) {
    for (const k of [c.name.toLowerCase(), identifierFor(c.name).toLowerCase()]) {
      if (!m.has(k)) m.set(k, c.value);
    }
  }
  current = m;
  signature = JSON.stringify([...m.entries()]);
}

/** Changes whenever a constant's name or value changes. */
export const infoSignature = () => signature;

const WHOLE = /^\s*@\s*(.+?)\s*$/;
const TOKEN = /@([A-Za-z_][A-Za-z0-9_]*)/g;

function resolveString(s: string): string {
  const w = WHOLE.exec(s);
  if (w && current.has(w[1].toLowerCase())) return current.get(w[1].toLowerCase())!;
  if (!s.includes("@")) return s;
  return s.replace(TOKEN, (all, name: string) => current.get(name.toLowerCase()) ?? all);
}

/** A copy of `v` with every "@Name" in its strings replaced. */
export function resolveInfoRefs<T>(v: T): T {
  if (typeof v === "string") return resolveString(v) as unknown as T;
  if (Array.isArray(v)) {
    const out = v.map(resolveInfoRefs);
    return (out.some((x, i) => x !== v[i]) ? out : v) as unknown as T;
  }
  if (v && typeof v === "object") {
    let changed = false;
    const out: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
      const r = resolveInfoRefs(x);
      if (r !== x) changed = true;
      out[k] = r;
    }
    return (changed ? out : v) as T;
  }
  return v;
}
