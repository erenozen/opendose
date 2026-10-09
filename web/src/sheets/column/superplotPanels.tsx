// Panels of "Statistics on replicate means": the test settings, the
// results (labelled with the number of experiments, the table of
// replicate means, then the ordinary column-analysis results) and the
// methods text.
import { RM_METHOD_LABELS, RM_METHODS } from "./rmPosthoc";
import type { ReactNode } from "react";
import StatsResults from "../../components/StatsResults";
import { softwareSentence } from "../../export/cite";
import { getRuntimeVersions } from "../../lib/engine";
import { COMPARISONS_LABELS, formatSig, type ComparisonsMethod } from "../../types";
import CopyableMethods from "../common/CopyableMethods";
import { replicateInfo, replicateMeansInfo } from "../common/superplot";
import type { ControlsProps, ResultsProps } from "../types";
import { columnMethodsSentence } from "./methodsSentence";
import {
  columnOptionsFor, REP_TEST_LABELS, TWO_GROUP_TESTS, type RepMeansOptions, type RepTest,
} from "./superplotStats";

/* eslint-disable @typescript-eslint/no-explicit-any */

function Row({ label, children }: { label: string; children: ReactNode }) {
  return <label className="check-row"><span>{label}</span>{children}</label>;
}

export function ReplicateMeansControls({ table, options: o, onChange }:
  ControlsProps<RepMeansOptions>) {
  const set = (patch: Partial<RepMeansOptions>) => onChange({ ...o, ...patch });
  const info = replicateInfo(table);
  const groups = info.groups.map((ds) => table.datasets[ds]?.name || `Data set ${ds + 1}`);
  const two = TWO_GROUP_TESTS.includes(o.test);
  const pick = (label: string, value: number, key: "datasetA" | "datasetB" | "controlIndex") => (
    <Row label={label}>
      <select value={Math.min(value, Math.max(0, groups.length - 1))}
        onChange={(e) => set({ [key]: Number(e.target.value) } as Partial<RepMeansOptions>)}>
        {groups.map((g, i) => <option key={i} value={i}>{g}</option>)}
      </select>
    </Row>
  );
  return (
    <div className="controls">
      <section>
        <h3>Statistics on replicate means</h3>
        <p className="hint-block">
          Each experiment&apos;s values are averaged first, so n is the number of
          experiments ({info.names.length} here: {info.names.join(", ") || "none"}), not the
          number of values. Which values belong to which experiment is set in the graph&apos;s
          Settings → SuperPlot.
        </p>
        <Row label="Each experiment by its">
          <select value={o.center} onChange={(e) => set({ center: e.target.value === "median" ? "median" : "mean" })}>
            <option value="mean">Mean</option>
            <option value="median">Median</option>
          </select>
        </Row>
      </section>
      <section>
        <h3>Test</h3>
        <select aria-label="Test on the replicate means" value={o.test}
          onChange={(e) => set({ test: e.target.value as RepTest })}>
          <optgroup label="Two groups">
            {TWO_GROUP_TESTS.map((k) => <option key={k} value={k}>{REP_TEST_LABELS[k]}</option>)}
          </optgroup>
          <optgroup label="Three or more groups">
            {(["rm_anova", "anova", "friedman", "kruskal"] as RepTest[]).map((k) => (
              <option key={k} value={k}>{REP_TEST_LABELS[k]}</option>
            ))}
          </optgroup>
        </select>
        {two && pick("Group A", o.datasetA, "datasetA")}
        {two && pick("Group B", o.datasetB, "datasetB")}
        {o.test === "anova" && (
          <Row label="Multiple comparisons">
            <select value={o.comparisons}
              onChange={(e) => set({ comparisons: e.target.value as ComparisonsMethod })}>
              {(Object.keys(COMPARISONS_LABELS) as ComparisonsMethod[]).map((k) => (
                <option key={k} value={k}>{COMPARISONS_LABELS[k]}</option>
              ))}
            </select>
          </Row>
        )}
        {o.test === "anova" && o.comparisons === "dunnett" && pick("Control", o.controlIndex, "controlIndex")}
        {o.test === "rm_anova" && (
          <Row label="Multiple comparisons">
            <select value={(RM_METHODS as readonly string[]).includes(o.comparisons) ? o.comparisons : "none"}
              onChange={(e) => set({ comparisons: e.target.value as ComparisonsMethod })}>
              {(["none", ...RM_METHODS] as const).map((k) => (
                <option key={k} value={k}>{RM_METHOD_LABELS[k]}</option>
              ))}
            </select>
          </Row>
        )}
        {o.test === "rm_anova" && o.comparisons === "dunnett" && pick("Baseline", o.controlIndex, "controlIndex")}
        <p className="hint-block">
          Matched tests pair the groups by experiment: use them when every experiment ran
          all conditions side by side.
        </p>
      </section>
    </div>
  );
}

export function ReplicateMeansResults({ result, options }:
  ResultsProps<RepMeansOptions, Record<string, unknown>>) {
  if (!result) return null;
  const info = replicateMeansInfo(result);
  const r = result as any;
  const means = r.replicate_means as { replicates: string[];
    groups: { name: string; values: (number | null)[] }[] } | undefined;
  return (
    <div className="results">
      <div className="result-card replicate-means-head">
        <h3>
          {REP_TEST_LABELS[options.test]} on replicate {options.center}s
          {info ? ` (n = ${info.n} experiment${info.n === 1 ? "" : "s"})` : ""}
        </h3>
        {means && (
          <table className="results-table">
            <thead>
              <tr><th>Experiment</th>{means.groups.map((g) => <th key={g.name}>{g.name}</th>)}</tr>
            </thead>
            <tbody>
              {means.replicates.map((rep, i) => (
                <tr key={rep}>
                  <th>{rep}</th>
                  {means.groups.map((g) => <td key={g.name}>{formatSig(g.values[i])}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <StatsResults result={result} />
    </div>
  );
}

export function ReplicateMeansMethods({ options, result }:
  ResultsProps<RepMeansOptions, Record<string, unknown>>) {
  const info = replicateMeansInfo(result);
  if (!result || (result as any).error || !info) return null;
  let test = "";
  try { test = columnMethodsSentence(columnOptionsFor(options), result as any); } catch { test = ""; }
  const lead = `Values were summarised by their ${options.center} within each independent experiment`
    + ` (biological replicate), and statistics were computed on the ${info.n} experiment ${options.center}s`
    + " per group (SuperPlot; Lord et al., J Cell Biol 2020).";
  return <CopyableMethods text={`${lead} ${test} ${softwareSentence(getRuntimeVersions())}`.replace(/\s+/g, " ").trim()} />;
}
