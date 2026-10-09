// Example of the time-course module: the AUC assay's glucose tolerance test
// (aucSample: blood glucose, mg/dL, at 0 to 120 min, four mice on chow and
// four on a high-fat diet, one subcolumn per mouse) with two more mice per
// diet, so 2 groups × 6 mice × 6 times. Synthetic numbers in the usual
// range; not from a publication.
import { normalizeTable } from "../../../project/table.ts";
import type { DataTableModel } from "../../../project/types.ts";
import { aucSample } from "../aucSample.ts";

// two more mice per diet [mouse][time], same times as aucSample
const MORE: Record<string, number[][]> = {
  Chow: [[90, 200, 252, 185, 132, 105], [97, 218, 241, 170, 145, 115]],
  "High-fat diet": [[131, 298, 350, 296, 250, 188], [126, 305, 340, 310, 235, 200]],
};

export function timecourseSample(): DataTableModel {
  const gtt = aucSample();
  return normalizeTable({
    ...gtt,
    datasets: gtt.datasets.map((d, di) => {
      const extra = MORE[d.name] ?? [];
      const prefix = di === 0 ? "C" : "H";
      const width = (d.rows[0]?.length ?? 0) + extra.length;
      return {
        ...d,
        subTitles: Array.from({ length: width }, (_, k) => `${prefix}${k + 1}`),
        rows: d.rows.map((row, r) => [...row, ...extra.map((m) => String(m[r]))]),
      };
    }),
  }, "xy");
}
