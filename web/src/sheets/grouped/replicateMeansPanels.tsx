// Panels of the two-way ANOVA on replicate means: the two-way settings
// with how each experiment is summarised, the results labelled with the
// number of experiments, and the methods text.
import CopyableMethods from "../common/CopyableMethods";
import { replicateInfo, replicateMeansInfo } from "../common/superplot";
import type { ControlsProps, ResultsProps } from "../types";
import { TwoWayControls } from "./controls";
import { TwoWayMethods } from "./methods";
import type { RepTwoWayOptions } from "./options";
import { TwoWayResults } from "./results";

export function RepTwoWayControls(props: ControlsProps<RepTwoWayOptions>) {
  const { table, options: o, onChange } = props;
  const info = replicateInfo({ ...table, type: "grouped" });
  return (
    <>
      <div className="controls">
        <section>
          <h3>Statistics on replicate means</h3>
          <p className="hint-block">
            Each cell&apos;s values are summarised per experiment first, so n is the number of
            experiments ({info.names.length}: {info.names.join(", ")}). Which subcolumns belong
            to which experiment is set in the graph&apos;s Settings → SuperPlot. Matching both
            factors pairs the cells by experiment.
          </p>
          <label className="check-row">
            <span>Each experiment by its</span>
            <select value={o.center}
              onChange={(e) => onChange({ ...o, center: e.target.value === "median" ? "median" : "mean" })}>
              <option value="mean">Mean</option>
              <option value="median">Median</option>
            </select>
          </label>
        </section>
      </div>
      <TwoWayControls {...props} onChange={(next) => onChange({ ...o, ...next })} />
    </>
  );
}

export function RepTwoWayResults(props: ResultsProps<RepTwoWayOptions, Record<string, unknown>>) {
  const info = replicateMeansInfo(props.result);
  return (
    <div className="results">
      <div className="result-card replicate-means-head">
        <h3>Two-way ANOVA on replicate {props.options.center}s
          {info ? ` (n = ${info.n} experiment${info.n === 1 ? "" : "s"})` : ""}</h3>
      </div>
      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
      <TwoWayResults {...(props as any)} />
    </div>
  );
}

export function RepTwoWayMethods(props: ResultsProps<RepTwoWayOptions, Record<string, unknown>>) {
  const info = replicateMeansInfo(props.result);
  if (!info) return null;
  return (
    <>
      <CopyableMethods text={`Values were summarised by their ${props.options.center} within each`
        + ` independent experiment (biological replicate) and the two-way analysis used the`
        + ` ${info.n} experiment ${props.options.center}s of each cell (SuperPlot; Lord et al.,`
        + " J Cell Biol 2020)."} />
      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
      <TwoWayMethods {...(props as any)} />
    </>
  );
}
