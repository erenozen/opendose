// The one-click log Y axis offered when a column analysis runs on the log
// scale: the graph-format layer's `y.scale` (graph/format.ts), so Format
// axes shows and undoes it like any other axis setting. Pure.
import type { GraphFormat } from "../../graph/format.ts";

/** Column graph kinds whose Y axis shows the analysed values. */
export const LOG_AXIS_KINDS: ReadonlySet<string> = new Set(["scatter", "bar", "box", "violin"]);

/** The format already draws Y on a log10 scale. */
export function hasLogY(f: GraphFormat): boolean {
  return f.y?.scale === "log10";
}

/** The format with a log10 Y axis (a manual range is kept only when both
 *  ends are positive: a log axis cannot start at 0). */
export function withLogY(f: GraphFormat): GraphFormat {
  const y = { ...(f.y ?? {}), scale: "log10" as const };
  if ((typeof y.min === "number" && y.min <= 0) || (typeof y.max === "number" && y.max <= 0)) {
    delete y.min; delete y.max;
  }
  return { ...f, y };
}
