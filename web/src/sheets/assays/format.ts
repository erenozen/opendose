// Text formatting shared by the assay results.
import { pLabel } from "../common/statFormat";

/** "P = 0.0123" or "P < 0.0001", in the project's P-value style. */
export function pText(p: unknown): string {
  return pLabel(p);
}
