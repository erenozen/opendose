// The joint confidence region of two fitted parameters (P-102) on a curve
// fit's results: pick the pair, plot it on its own graph sheet, and read
// what was traced (engine fitregion.JointRegion; words: fitRegion.ts).
import { useId, useState } from "react";
import { useProject } from "../../app/context";
import { newId } from "../../project/ids";
import { addSheets, findSheet, makeGraphSheet, updateResultsOptions } from "../../project/ops";
import type { ResultsSheet } from "../../project/types";
import { GRAPH_FIT_REGION } from "../../project/builtin";
import type { AnalysisResult, OptionsState } from "../../types";
import { Button, Field, NumText } from "../../components/ui";
import { defaultPair, regionParams, regionSentence, regionView } from "./fitRegion";
import "./xy.css";

export function RegionCard({ sheet, result, options }: {
  sheet: ResultsSheet; result: AnalysisResult | null; options: OptionsState;
}) {
  const { project, apply, select, readOnly } = useProject();
  const ids = useId();
  const params = regionParams(result);
  const asked = options.jointRegion;
  const fallback = defaultPair(params);
  const [pick, setPick] = useState<[string, string] | null>(null);
  const pair = pick ?? (asked && params.includes(asked[0]) && params.includes(asked[1]) ? asked : fallback);
  if (!pair || params.length < 2) return null;
  const locked = !!sheet.frozen || readOnly;
  const graphs = project.sheets.filter((s) => s.kind === "graph" && s.resultsId === sheet.id
    && s.graphType === GRAPH_FIT_REGION);
  const same = !!asked && asked[0] === pair[0] && asked[1] === pair[1];
  const view = same ? regionView(result) : null;
  const plot = () => {
    const parentName = findSheet(project, sheet.parentId)?.name ?? "table";
    const id = graphs[0]?.id ?? newId();
    apply((p) => {
      let next = updateResultsOptions(p, sheet.id, (o) => ({ ...(o as OptionsState), jointRegion: pair }));
      if (!graphs.length) {
        next = addSheets(next, [makeGraphSheet(id, sheet.parentId, sheet.id, GRAPH_FIT_REGION,
          { titles: { x: "", y: "" }, scheme: p.prefs.scheme }, `Joint region of ${parentName}`)], sheet.id);
      }
      return next;
    });
    select(id);
  };
  const choose = (i: 0 | 1, v: string) => {
    const next: [string, string] = [...pair];
    next[i] = v;
    if (next[0] === next[1]) next[1 - i] = pair[i];
    setPick(next);
  };
  return (
    <div className="result-card region-card">
      <h3>Joint confidence region</h3>
      <p className="model-line">
        Where two parameters can lie together, the others refitted at every point: a tilted or
        banana-shaped region shows estimates that trade off against each other.
      </p>
      <div className="region-pick">
        <Field label="X axis" id={`${ids}-x`}>
          <select id={`${ids}-x`} value={pair[0]} disabled={locked}
            onChange={(e) => choose(0, e.target.value)}>
            {params.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </Field>
        <Field label="Y axis" id={`${ids}-y`}>
          <select id={`${ids}-y`} value={pair[1]} disabled={locked}
            onChange={(e) => choose(1, e.target.value)}>
            {params.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </Field>
        {same && graphs.length ? (
          <Button onClick={() => select(graphs[0].id)}>Open “{graphs[0].name}”</Button>
        ) : (
          <Button disabled={locked} onClick={plot}>Plot the region</Button>
        )}
      </div>
      {view && (
        <>
          <p className="hint-block"><NumText text={regionSentence(view)} /></p>
          {view.sets.map((s) => (s.error ? (
            <p key={s.name} className="caveat-note">{s.name}: {s.error.replace(/\.$/, "")}.</p>
          ) : s.open ? (
            <p key={s.name} className="caveat-note">
              {s.name}: the region is open. The data do not bound {pair[0]} and {pair[1]} in every
              direction, and its edge breaks off where it runs away.
            </p>
          ) : null))}
        </>
      )}
    </div>
  );
}
