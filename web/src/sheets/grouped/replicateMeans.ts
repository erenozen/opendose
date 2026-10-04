// Two-way ANOVA on replicate means (grouped SuperPlots): each row × data
// set cell is reduced to one value per experiment (the mean or median of
// the subcolumns assigned to it), and the ordinary two-way analysis runs
// on those, so n is the number of experiments. Pure: the engine is passed.
type EngineBridge = { analyze: (payload: unknown) => unknown };
import type { DataTableModel } from "../../project/types.ts";
import { groupedReplicateMeanTable, replicateInfo } from "../common/superplot.ts";
import type { RepTwoWayOptions } from "./options.ts";
import { runTwoWay } from "./run.ts";

export function runReplicateTwoWay(engine: EngineBridge, table: DataTableModel,
  o: RepTwoWayOptions): Record<string, unknown> {
  if (table.subcolumnFormat !== "replicates") {
    return { error: "Statistics on replicate means need the individual values "
      + "(replicate subcolumns), not summary data." };
  }
  const names = replicateInfo({ ...table, type: "grouped" }).names;
  if (names.length < 2) {
    return { error: "Only one experiment: assign the subcolumns to at least two "
      + "experiments in the graph's SuperPlot options." };
  }
  const means = groupedReplicateMeanTable(table, o.center);
  const r = runTwoWay(engine, means, o);
  return { ...r, superplot: { n: names.length, replicates: names, center: o.center } };
}
