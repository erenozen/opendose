// The graph-format dialogs as one unit for a graph card: the actions the
// Settings panel lists, and the dialog element to render next to it.
import { useMemo, useState, type ReactNode } from "react";
import "./graph.css";
import type { SchemeId } from "../lib/palette";
import AnnotationsDialog from "./AnnotationsDialog";
import ComparisonsDialog from "./ComparisonsDialog";
import FormatAxesDialog from "./FormatAxesDialog";
import FormatGraphDialog from "./FormatGraphDialog";
import { plottedOrder } from "./apply";
import { DEFAULT_FEATURES, type FormatFeatures, type GraphFormat } from "./format";
import { extractComparisons, resultBlocks, type ComparisonSet } from "./results";

export interface FormatAction {
  id: string;
  label: string;
  onClick: () => void;
}

type Open = "graph" | "axes" | "annotations" | "comparisons" | null;
type Titles = { x: string; y: string };

export function useFormatDialogs({
  format, features = DEFAULT_FEATURES, datasets, hasRowTitles, result, scheme,
  titles, autoTitles, engineReady, onFormat, comparisons,
}: {
  format: GraphFormat;
  features?: FormatFeatures;
  /** Dataset names as entered (index = key in GraphFormat.datasets). */
  datasets: string[];
  hasRowTitles: boolean;
  /** Result of the results sheet the graph is bound to (or null). */
  result: unknown;
  scheme: SchemeId;
  titles: Titles;
  autoTitles: Titles;
  engineReady: boolean;
  /** Save a new format (and, from Format Axes, changed axis titles) as one
   *  undo step. */
  onFormat: (f: GraphFormat, titles?: Titles) => void;
  /** Comparisons the graph can draw, when the graph kind reads them itself
   *  (grouped graphs: comparisons within rows). Undefined = read them from
   *  the result for category graphs. */
  comparisons?: ComparisonSet | null;
}): { actions: FormatAction[]; element: ReactNode } {
  const [open, setOpen] = useState<Open>(null);
  const cmpSet = useMemo(() => (comparisons !== undefined ? comparisons
    : features.categorical ? extractComparisons(result, datasets) : null),
  [comparisons, features.categorical, result, datasets]);
  const blocks = useMemo(() => resultBlocks(result, format.pStyle), [result, format.pStyle]);
  const hasY2 = Object.values(format.datasets ?? {}).some((d) => d.rightAxis) || !!format.y2;

  const actions: FormatAction[] = [
    { id: "graph", label: "Format graph…", onClick: () => setOpen("graph") },
    ...(features.noAxes ? [] : [
      { id: "axes", label: "Format axes…", onClick: () => setOpen("axes") }]),
    { id: "annotations", label: "Annotations…", onClick: () => setOpen("annotations") },
  ];
  if (cmpSet && cmpSet.comparisons.length) {
    actions.push({ id: "comparisons", label: "Pairwise comparisons…",
      onClick: () => setOpen("comparisons") });
  }

  const close = () => setOpen(null);
  let element: ReactNode = null;
  if (open === "graph") {
    element = <FormatGraphDialog format={format} datasets={datasets} features={features}
      scheme={scheme} hasRowTitles={hasRowTitles} onApply={onFormat} onClose={close} />;
  } else if (open === "axes") {
    element = <FormatAxesDialog format={format} titles={titles} autoTitles={autoTitles}
      categoricalX={!!features.categorical || !!features.categoryX} hasY2={hasY2} onClose={close}
      onApply={(f, t) => onFormat(f, t.x !== titles.x || t.y !== titles.y ? t : undefined)} />;
  } else if (open === "annotations") {
    element = <AnnotationsDialog format={format} results={blocks} onApply={onFormat}
      paperOnly={!!features.noAxes} onClose={close} />;
  } else if (open === "comparisons" && cmpSet) {
    const groups = plottedOrder(format, datasets.length).map((i) => datasets[i]);
    element = <ComparisonsDialog format={format} set={cmpSet} groups={groups}
      engineReady={engineReady} onApply={onFormat} onClose={close} />;
  }
  return { actions, element };
}
