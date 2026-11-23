// Simulating from a user-defined equation (P-51): the parameters a form
// offers for it, and how the methods sentence names it. The engine
// compiles the equation and evaluates it exactly as a fit of it does
// (engine/opendose/simulate.py). Pure; unit-tested.
import { parseNumber } from "../../components/ui/Field.validation.ts";
import type { UserEquationDef } from "../../lib/userEquation.ts";

export interface UserSimParam { name: string; label: string; value: number }

/** Every parameter of the equation's rules, starting at the rule's
 *  number when the rule is a plain value, else at 1. */
export function userSimParams(def: UserEquationDef): UserSimParam[] {
  return Object.entries(def.rules).map(([name, r]) => {
    const v = r.kind === "value" ? parseNumber(r.value) : null;
    return { name, label: name, value: v ?? 1 };
  });
}

/** "the user-defined equation “Decay” (Y = A*exp(-k*X))": the equation's
 *  lines without their comments, joined by "; ". */
export function userEquationPhrase(def: UserEquationDef): string {
  const lines = def.text.split(/\r?\n/).map((l) => l.split(";")[0].trim()).filter(Boolean);
  return `the user-defined equation “${def.name.trim() || "User-defined equation"}” (${lines.join("; ")})`;
}
