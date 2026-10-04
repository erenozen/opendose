// Example combination matrix: SynergyFinder's vignette data
// (Bioconductor synergyfinder 3.20, data/mathews_screening_data, block 1):
// ispinesib (rows, nM) × ibrutinib (columns, nM), % viability. The same
// block pins HSA and Bliss in engine/tests/test_assay_synergy.py.
import type { DataTableModel } from "../../project/types.ts";
import { synergyTable } from "./synergyModel.ts";

const IBRUTINIB = ["0", "0.1954", "0.7812", "3.125", "12.5", "50"];
const ISPINESIB = ["0", "9.7656", "39.0626", "156.25", "625", "2500"];
// rows in ISPINESIB order, columns in IBRUTINIB order
const VIABILITY = [
  ["122.956184", "103.760060", "118.138510", "58.826880", "46.666996", "28.695145"],
  ["40.775620", "36.374866", "28.036972", "11.760282", "14.995420", "8.948099"],
  ["39.754314", "36.871628", "29.103006", "13.511189", "7.064885", "6.276571"],
  ["39.237450", "33.517440", "25.934008", "12.425198", "7.612191", "5.724235"],
  ["39.372620", "38.052074", "23.261131", "14.096026", "6.551686", "5.933393"],
  ["45.790634", "38.043076", "24.503885", "15.089589", "6.831317", "7.802637"],
];

export function synergySample(): DataTableModel {
  return synergyTable(ISPINESIB, IBRUTINIB, [VIABILITY], "Viability (%)");
}
