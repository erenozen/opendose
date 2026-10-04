// Example data for quantal dose-response: the tobacco budworm experiment
// (Collett 1991; Venables & Ripley 2002, section 7.2, MASS `budworm`).
// Batches of 20 moths of each sex were exposed for three days to
// cypermethrin at 1, 2, 4, 8, 16 and 32 µg; X is log2(dose), as in the
// book. The engine's tests pin MASS::dose.p for the parallel logit model:
// female log2 doses 2.231 (25% killed), 3.264 (50%) and 4.296 (75%).
import { normalizeTable } from "../../project/table.ts";
import type { DataTableModel } from "../../project/types.ts";

export function budwormTable(): DataTableModel {
  const killed = { Male: [1, 4, 9, 13, 18, 20], Female: [0, 2, 6, 10, 12, 16] };
  return normalizeTable({
    type: "xy",
    x: ["0", "1", "2", "3", "4", "5"],
    xTitle: "log2(dose, µg)",
    xUnit: "",
    yTitle: "Moths killed",
    datasets: Object.entries(killed).map(([name, k]) => ({
      name,
      subTitles: ["Killed", "N"],
      rows: k.map((v) => [String(v), "20"]),
    })),
  });
}
