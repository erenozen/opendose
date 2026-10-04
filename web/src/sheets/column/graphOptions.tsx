// Graph options of the column graphs (Settings panel): centre and error
// bars, how points spread, points on bars (with the small-n advice), the
// legend sentence, and SuperPlot mode with its replicate assignment and
// "Statistics on replicate means".
import { OptCheck, OptSelect } from "../../components/GraphOptionControls";
import { POINT_SPREADS } from "../../graph/swarm";
import type { GraphOptionsProps } from "../types";
import { superPlotOn } from "../common/superplot";
import SuperPlotOptions from "../common/SuperPlotOptions";
import { useGraphSetting } from "../grouped/plotting";
import {
  CAPTION_LABELS, COLUMN_SUMMARY_LABELS, normalizeColumnGraph, smallestN,
  type ColumnGraphSettings, type ColumnSummary,
} from "./graphSettings";
import { ANALYSIS_REPLICATE_MEANS } from "./superplotStats";
import "../../graph/figure.css";

/** "Journals ask to show the points for n < 10", with a one-click fix. */
export function SmallNAdvice({ n, onShow }: { n: number; onShow: () => void }) {
  return (
    <p className="gopt-advice" role="note">
      <span>
        Journals ask to show the points for n &lt; 10 (smallest group here: n = {n}; see{" "}
        <a href="https://doi.org/10.1371/journal.pbio.1002128" target="_blank" rel="noreferrer">
          Weissgerber et al. 2015</a>,{" "}
        <a href="https://doi.org/10.1038/s41551-017-0079" target="_blank" rel="noreferrer">
          “Show the dots in plots”</a>).
      </span>
      <button type="button" onClick={onShow}>Show points</button>
    </p>
  );
}

export function ColumnGraphOptions({ graph, table, result }: GraphOptionsProps) {
  const [s, set] = useGraphSetting(graph, "column", normalizeColumnGraph);
  if (!set) return null;
  const up = (patch: Partial<ColumnGraphSettings>) => set({ ...s, ...patch });
  const kind = graph.graphType;
  const raw = table.subcolumnFormat === "replicates";
  const superOn = raw && superPlotOn(s.superplot, result);
  const summaryKinds = kind === "scatter" || kind === "bar";
  const pointsDrawn = kind === "scatter" || (kind === "bar" && s.points) || superOn;
  const n = smallestN(table);
  return (
    <>
      {raw && summaryKinds && !superOn && (
        <OptSelect label={kind === "bar" ? "Bars and error bars" : "Centre and error bars"}
          value={s.summary}
          options={(Object.keys(COLUMN_SUMMARY_LABELS) as ColumnSummary[])
            .map((k) => [k, COLUMN_SUMMARY_LABELS[k]] as const)}
          onChange={(summary) => up({ summary })} />
      )}
      {raw && kind === "bar" && !superOn && (
        <OptCheck label="Show individual values on the bars" checked={s.points}
          onChange={(points) => up({ points })} />
      )}
      {raw && kind === "bar" && !s.points && !superOn && n > 0 && n < 10 && (
        <SmallNAdvice n={n} onShow={() => up({ points: true })} />
      )}
      {raw && pointsDrawn && kind !== "box" && kind !== "violin" && (
        <OptSelect label="Point layout" value={s.spread} options={POINT_SPREADS}
          onChange={(spread) => up({ spread })} />
      )}
      <OptSelect label="Legend sentence" value={s.caption} options={CAPTION_LABELS}
        onChange={(caption) => up({ caption })}
        title="Error-bar meaning and n per group, as journals ask for in the figure legend" />
      {raw && table.type === "column" && <SuperPlotOptions graph={graph} table={table}
        result={result} s={s.superplot} on={superOn} onChange={(superplot) => up({ superplot })}
        analysis={ANALYSIS_REPLICATE_MEANS} settingsKey="column" />}
    </>
  );
}

