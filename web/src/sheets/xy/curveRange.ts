// The drawn curve's range (FEATURE-PLAN P-52): with a range set, the
// engine's curve (doseresponse.curve_points) carries the X range of the
// points fitted ("data_range") and holds both of its ends; the graph draws
// the part within the data as the curve and each part beyond it dotted,
// because there it is the model's extrapolation, not a measurement (the
// plan's "do not build" 9: no invented data). Without a range set the
// curve is returned whole, as before. Pure; unit-tested.
import { parseNumber } from "../../components/ui/Field.validation.ts";
import type { OptionsState } from "../../types.ts";

/** The engine's curve_range / curve_points options from the typed
 *  fields, or {} (blank fields, files saved before) for the default curve. */
export function curveOptions(options: Pick<OptionsState, "curveFrom" | "curveTo" | "curvePoints">):
  { curve_range?: [number | null, number | null]; curve_points?: number } {
  const from = parseNumber(options.curveFrom ?? "");
  const to = parseNumber(options.curveTo ?? "");
  const n = parseNumber(options.curvePoints ?? "");
  return {
    ...(from !== null || to !== null ? { curve_range: [from, to] } : {}),
    ...(n !== null ? { curve_points: n } : {}),
  };
}

export interface CurvePart { x: number[]; y: (number | null)[] }

interface Curve { x: number[]; y: (number | null)[]; data_range?: [number, number] }

/** The curve within the data, and the parts before and after it. Each
 *  part keeps the shared end point, so the line is unbroken. */
export function splitCurve(curve: Curve): { within: CurvePart; beyond: CurvePart[] } {
  const dr = curve.data_range;
  if (!dr || dr.length !== 2) return { within: { x: curve.x, y: curve.y }, beyond: [] };
  const [lo, hi] = dr;
  const pick = (keep: (x: number) => boolean): CurvePart => {
    const x: number[] = [];
    const y: (number | null)[] = [];
    curve.x.forEach((v, i) => { if (keep(v)) { x.push(v); y.push(curve.y[i]); } });
    return { x, y };
  };
  const before = pick((v) => v <= lo);
  const after = pick((v) => v >= hi);
  return {
    within: pick((v) => v >= lo && v <= hi),
    beyond: [before, after].filter((p) => p.x.length > 1),
  };
}

/** Does the drawn curve reach beyond the data? */
export function beyondData(curve: Curve | undefined | null): boolean {
  return !!curve && splitCurve(curve).beyond.length > 0;
}
