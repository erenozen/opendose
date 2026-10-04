// Controls, results, methods text and graph of the growth-curve analysis.
import { useMemo } from "react";
import PlotPanel from "../../components/PlotPanel";
import ResultsPanel from "../../components/ResultsPanel";
import { xTickFormatter } from "../../project/xformat";
import { datasetLetter } from "../../project/table";
import { formatSig } from "../../types";
import CopyableMethods from "../common/CopyableMethods";
import { fmtCI } from "../common/statFormat";
import type { ControlsProps, PlotProps, ResultsProps } from "../types";
import type { GrowthResult } from "./growth";
import {
  GROWTH_MODELS, transformedTable, type GrowthBlank, type GrowthLog, type GrowthOptions,
} from "./growthModel";
import { Card, Check, Grid, LinkedTable, Note, Row, Select, TextIn } from "./ui";

const BLANK_LABEL: Record<GrowthBlank, string> = {
  none: "None (already blanked)",
  min: "Each curve's minimum (Growthcurver's default)",
  value: "A constant you enter",
  dataset: "Row means of a blank data set",
};

const LOG_LABEL: Record<GrowthLog, string> = {
  none: "None (fit the OD itself)",
  ln: "Natural log, ln",
  log10: "log10",
  log2: "log2",
};

export function GrowthControls({ table, options: o, onChange }: ControlsProps<GrowthOptions>) {
  const set = (patch: Partial<GrowthOptions>) => onChange({ ...o, ...patch });
  const model = GROWTH_MODELS.find((m) => m.id === o.model);
  const logModel = model?.scale === "log";
  return (
    <div className="controls">
      <section>
        <h3>Blank</h3>
        <Select label="Subtract" value={o.blank}
          options={(Object.keys(BLANK_LABEL) as GrowthBlank[])
            .filter((k) => k !== "dataset" || table.datasets.length > 1)
            .map((k) => [k, BLANK_LABEL[k]] as const)}
          onChange={(blank) => set({ blank })} />
        {o.blank === "value" && (
          <TextIn label="Blank value" value={o.blankValue} onChange={(blankValue) => set({ blankValue })} />
        )}
        {o.blank === "dataset" && (
          <Row label="Blank data set">
            <select value={Math.min(o.blankDataset, table.datasets.length - 1)}
              onChange={(e) => set({ blankDataset: Number(e.target.value) })}>
              {table.datasets.map((d, i) => (
                <option key={i} value={i}>{d.name.trim() || `Data set ${datasetLetter(i)}`}</option>
              ))}
            </select>
          </Row>
        )}
      </section>
      <section>
        <h3>Transform</h3>
        <Select label="Take the log" value={o.log}
          options={(Object.keys(LOG_LABEL) as GrowthLog[]).map((k) => [k, LOG_LABEL[k]] as const)}
          onChange={(log) => set({ log })}
          hint="Values at or below zero after the blank have no logarithm; they are left out and counted." />
        <Check label="Express each curve relative to its first time point (N/N0)"
          checked={o.relativeToFirst} onChange={(relativeToFirst) => set({ relativeToFirst })} />
      </section>
      <section>
        <h3>Model</h3>
        <Select label="Growth model" value={o.model}
          options={GROWTH_MODELS.map((m) => [m.id, m.label] as const)}
          onChange={(m) => {
            const next = GROWTH_MODELS.find((x) => x.id === m);
            // Zwietering's parameters are defined on y = ln(N/N0).
            set(next?.scale === "log" && o.log === "none"
              ? { model: m, log: "ln", relativeToFirst: !m.endsWith("_baseline") }
              : { model: m });
          }} />
        {logModel && o.log === "none" && (
          <p className="hint-block">
            The Zwietering models describe log-transformed data (A is the
            asymptotic increase of ln N); choose a log above.
          </p>
        )}
        {!logModel && o.log !== "none" && (
          <p className="hint-block">
            This model describes the population itself, not its logarithm: fit
            it to untransformed values, or choose a Zwietering model.
          </p>
        )}
        {o.model === "logistic_growth" && (
          <p className="hint-block">
            Y = YM·Y0 / ((YM − Y0)·e^(−K·t) + Y0): Y0 is the starting population,
            YM the carrying capacity and K the growth rate. With the minimum
            subtracted this is the model Growthcurver fits.
          </p>
        )}
      </section>
    </div>
  );
}

export function GrowthResults({ sheet, table, options, result }: ResultsProps<GrowthOptions, GrowthResult>) {
  const xUnit = useMemo(() => {
    const m = /\(([^)]+)\)\s*$/.exec(table.xTitle);
    return m ? m[1] : "";
  }, [table.xTitle]);
  if (!result) return null;
  if (result.error) return <div className="results-error" role="alert">{result.error}</div>;
  const prep = result.prep;
  const names = result.datasets.map((d) => d.name);
  const unit = xUnit ? ` ${xUnit}` : "";
  return (
    <>
      <Card title="Growth curves">
        {prep && (prep.n_nonpositive_dropped > 0 || prep.n_missing_blank > 0) && (
          <Note warn>
            {prep.n_nonpositive_dropped > 0 && `${prep.n_nonpositive_dropped} value${
              prep.n_nonpositive_dropped === 1 ? " was" : "s were"} at or below zero after the blank and left out (no logarithm). `}
            {prep.n_missing_blank > 0 && `${prep.n_missing_blank} value${
              prep.n_missing_blank === 1 ? " has" : "s have"} no blank in the same row and were left out.`}
          </Note>
        )}
        <h4>Doubling time</h4>
        <Grid caption="Doubling time per curve" head={["", "Doubling time", "95% CI", "Computed as"]}
          rows={names.map((n, i) => {
            const d = result.doubling?.[i];
            return [n, d?.value != null ? `${formatSig(d.value)}${unit}` : "n/a",
              d?.ci ? fmtCI(d.ci) : "n/a", d?.how ?? "not defined for this model"];
          })} />
        <p className="hint-block">
          {options.model.startsWith("zwietering_")
            ? "ln 2 divided by the maximum specific growth rate MuMax (the slope of the tangent at the inflection point), with the CI of MuMax carried through."
            : "ln 2 divided by the rate K: the doubling time while the population is far below its plateau (Growthcurver's t_gen). The CI is the CI of K carried through the transform, so it is asymmetrical."}
        </p>
        <LinkedTable resultsId={sheet.id} name={`${sheet.name.replace(/^Growth curves of /, "")} (blanked)`}
          label="Create the preprocessed table"
          make={() => (prep ? transformedTable(table, prep, options) : null)} />
      </Card>
      <ResultsPanel result={result} xUnit={xUnit} />
    </>
  );
}

export function GrowthMethods({ options, result }: ResultsProps<GrowthOptions, GrowthResult>) {
  if (!result || result.error) return null;
  const model = GROWTH_MODELS.find((m) => m.id === options.model)?.label.replace(/ \(.*\)$/, "") ?? options.model;
  const blank = {
    none: "", min: "Each curve's minimum was subtracted as the blank (as Growthcurver does). ",
    value: `A blank of ${options.blankValue} was subtracted. `,
    dataset: "The row means of the blank wells were subtracted. ",
  }[options.blank];
  const log = options.log === "none" ? "" : `Values were ${options.log}-transformed${
    options.relativeToFirst ? " and expressed relative to the first time point" : ""}. `;
  const zw = options.model.startsWith("zwietering_");
  const text = `${blank}${log}A ${model.toLowerCase()} model was fitted to each curve by `
    + `nonlinear least squares${zw ? " in the reparameterisation of Zwietering et al. (1990)" : ""}; `
    + `the doubling time was computed as ln 2 / ${zw ? "MuMax" : "K"} with the 95% confidence `
    + `interval of the rate carried through the transform${options.model === "logistic_growth"
      ? " (Sprouffske and Wagner, 2016)" : ""}. Analysis in OpenDose (open-source, built on SciPy).`;
  return <CopyableMethods text={text} />;
}

export function GrowthPlot({ table, result, titles, scheme, format, onFormatChange }:
  PlotProps<GrowthOptions, GrowthResult>) {
  const xTickFormat = useMemo(() => xTickFormatter(table) ?? undefined, [table]);
  return (
    <PlotPanel result={result} scheme={scheme} xTitle={titles.x} yTitle={titles.y}
      xTickFormat={xTickFormat} format={format} onFormatChange={onFormatChange}
      rowTitles={table.rowTitles} />
  );
}
