// Validation timing for fields: reward early, punish late
// (emil-forms-and-inputs). A problem is not shown while the first
// attempt is being typed; it appears when the field is left (blur) or a
// submit is attempted, and from then on it follows every change, so it
// clears the moment the value becomes valid. Once cleared, the next
// problem again waits for a blur or a submit.

export type ValidationEvent = "change" | "blur" | "submit";

/** Next "shown" state after an event, given whether the value now has a
 *  problem. */
export function nextShown(shown: boolean, event: ValidationEvent, hasProblem: boolean): boolean {
  if (!hasProblem) return false;
  if (event === "blur" || event === "submit") return true;
  return shown;
}

/** The message to show: the problem, once it has earned its place. */
export function visibleProblem(shown: boolean, problem: string | null | undefined): string | null {
  return shown && problem ? problem : null;
}

/** Number entry: the problem with `raw`, or null. Blank is allowed
 *  unless required. Accepts a decimal comma. */
export function numberProblem(raw: string, o: {
  min?: number; max?: number; required?: boolean; integer?: boolean;
} = {}): string | null {
  const s = raw.trim();
  if (!s) return o.required ? "Enter a number" : null;
  const n = parseNumber(s);
  if (n === null) return "Enter a number";
  if (o.integer && !Number.isInteger(n)) return "Enter a whole number";
  if (o.min !== undefined && n < o.min) return `Enter ${o.min} or more`;
  if (o.max !== undefined && n > o.max) return `Enter ${o.max} or less`;
  return null;
}

export function parseNumber(s: string): number | null {
  const t = s.trim().replace(/^(-?\d+),(\d+)$/, "$1.$2");
  if (!/^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(t)) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}
