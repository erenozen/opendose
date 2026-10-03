import { normalizeTable } from "../../project/table.ts";
import type { DataTableModel } from "../../project/types.ts";

// Synthetic example: tumour volume (mm³) in two treatment arms measured
// on three days, three animals per cell. Vehicle tumours keep growing
// while the drug slows them, so the time × treatment interaction is
// large, the day-7 difference is negligible, and day 14 and 21 differ.
export function groupedSample(): DataTableModel {
  return normalizeTable({
    type: "grouped",
    yTitle: "Tumour volume (mm³)",
    rowTitles: ["Day 7", "Day 14", "Day 21"],
    x: ["", "", ""],
    datasets: [
      { name: "Vehicle", rows: [["152", "168", "141"], ["298", "341", "312"],
        ["512", "587", "549"]] },
      { name: "Drug", rows: [["148", "139", "160"], ["221", "205", "239"],
        ["302", "276", "331"]] },
    ],
  });
}
