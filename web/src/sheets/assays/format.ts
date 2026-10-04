// Text formatting shared by the assay results.
import { fmtP } from "../common/statFormat";

/** "P = 0.0123" or "P < 0.0001". */
export function pText(p: unknown): string {
  const s = fmtP(p);
  return s.startsWith("<") ? `P ${s}` : `P = ${s}`;
}
