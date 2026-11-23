// Graph options of the curve-fit graph (Settings panel): IC50 / EC50 drop
// lines with their value label (sheets/xy/fitGraph.ts) and where the
// figure legend goes (sheets/xy/fitLegend.ts).
import { useMemo } from "react";
import { OptCheck, OptNote, OptSelect } from "../../components/GraphOptionControls";
import type { GraphOptionsProps } from "../types";
import { useGraphSetting } from "../grouped/plotting";
import { CAPTION_LABELS } from "../column/graphSettings";
import { dropPoints, normalizeXYGraph } from "./fitGraph";

export function XYGraphOptions({ graph, result }: GraphOptionsProps) {
  const [s, set] = useGraphSetting(graph, "xy", normalizeXYGraph);
  const points = useMemo(() => dropPoints(result), [result]);
  if (!set) return null;
  const labels = [...new Set(points.map((p) => p.label))].join(" / ");
  const hidden = points.filter((p) => !p.drawn);
  return (
    <>
      {points.length > 0 && (
        <OptCheck label={`Show ${labels} drop lines`} checked={s.dropLines}
          onChange={(dropLines) => set({ ...s, dropLines })}
          title={`Dashed lines from the curve at the ${labels} to both axes`} />
      )}
      {points.length > 0 && s.dropLines && (
        <OptCheck label={`Write the ${labels} next to the point`} checked={s.dropLabel}
          onChange={(dropLabel) => set({ ...s, dropLabel })} />
      )}
      {s.dropLines && hidden.map((p) => !p.drawn && (
        <OptNote key={p.ds}>Not drawn for {p.name}: {p.reason}.</OptNote>
      ))}
      <OptSelect label="Legend sentence" value={s.caption} options={CAPTION_LABELS}
        onChange={(caption) => set({ ...s, caption })}
        title="The model, how it was fitted, the band and the points ROUT removed, as journals ask for in the figure legend" />
    </>
  );
}
